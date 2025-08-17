import { useState, useEffect, useRef, useCallback } from "react";
import { MessageCard } from "./MessageCard";
import { PostMessageDialog } from "./PostMessageDialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface Message {
  id: string;
  content: string;
  author: string;
  timestamp: Date;
  gradientType: 'purple' | 'cyan' | 'green' | 'orange';
}

interface DBMessage {
  id: number;
  username: string | null;
  content: string;
  created_at: string; // ISO
}

const PAGE_SIZE = 10;
const MAX_PULL = 120;
const THRESHOLD = 60;
const DAMPING = 0.5;

type PullMode = null | "top" | "bottom";

export const MessageWall = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isPostDialogOpen, setIsPostDialogOpen] = useState(false);

  // 顶部/底部拉动的 UI 状态
  const [topPull, setTopPull] = useState(0);
  const [topReady, setTopReady] = useState(false);
  const [topLoading, setTopLoading] = useState(false);

  const [bottomPull, setBottomPull] = useState(0);
  const [bottomReady, setBottomReady] = useState(false);
  const [bottomLoading, setBottomLoading] = useState(false);

  // 游标：最新与最老
  const newestCursorRef = useRef<string | null>(null);
  const oldestCursorRef = useRef<string | null>(null);

  // 手势 refs
  const pullingRef = useRef(false);
  const pullModeRef = useRef<PullMode>(null);
  const startYRef = useRef(0);
  const busyRef = useRef(false); // 任一刷新/加载中，避免并发

  const gradientTypes: Array<'purple' | 'cyan' | 'green' | 'orange'> = [
    'purple', 'cyan', 'green', 'orange'
  ];

  const mapDB = (rows: DBMessage[]): Message[] =>
    rows.map((msg) => ({
      id: msg.id.toString(),
      content: msg.content,
      author: msg.username ?? '匿名',
      timestamp: new Date(msg.created_at),
      gradientType:
        gradientTypes[Math.floor(Math.random() * gradientTypes.length)],
    }));

  // 初始加载：取最新 10 条（默认服务端按时间倒序）
  const loadInitial = useCallback(async () => {
    const res = await fetch(`/messages?limit=${PAGE_SIZE}`);
    const data: DBMessage[] = await res.json();
    const list = mapDB(data);
    setMessages(list);
    if (list.length > 0) {
      newestCursorRef.current = list[0].timestamp.toISOString();
      oldestCursorRef.current = list[list.length - 1].timestamp.toISOString();
    }
  }, []);

  // 顶部：拉取比 newestCursor 更新的消息；回退：整页并去重
  const loadNewer = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setTopLoading(true);
    try {
      let incoming: DBMessage[] = [];
      if (newestCursorRef.current) {
        // 推荐：后端支持 after
        const res = await fetch(
          `/messages?limit=${PAGE_SIZE}&after=${encodeURIComponent(newestCursorRef.current)}`
        );
        incoming = await res.json();
      } else {
        const res = await fetch(`/messages?limit=${PAGE_SIZE}`);
        incoming = await res.json();
      }

      const newer = mapDB(incoming);
      if (newer.length > 0) {
        // 合并去重（以 id 为准）
        setMessages((prev) => {
          const map = new Map<string, Message>();
          [...newer, ...prev].forEach((m) => map.set(m.id, m));
          const merged = Array.from(map.values()).sort(
            (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
          );
          return merged;
        });
        // 更新 newestCursor
        const newest = newer[0].timestamp.toISOString();
        newestCursorRef.current = newest;
        // 初次加载后可能没有 oldest，兜底
        if (!oldestCursorRef.current) {
          const last = newer[newer.length - 1].timestamp.toISOString();
          oldestCursorRef.current = last;
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTopLoading(false);
      busyRef.current = false;
    }
  }, []);

  // 底部：拉取更老（before 游标）；回退：用 offset
  const loadOlder = useCallback(async () => {
    if (busyRef.current) return;
    if (!oldestCursorRef.current && messages.length === 0) return;

    busyRef.current = true;
    setBottomLoading(true);
    try {
      let incoming: DBMessage[] = [];
      if (oldestCursorRef.current) {
        const res = await fetch(
          `/messages?limit=${PAGE_SIZE}&before=${encodeURIComponent(oldestCursorRef.current)}`
        );
        incoming = await res.json();
      } else {
        // 回退：offset 模式
        const res = await fetch(`/messages?limit=${PAGE_SIZE}&offset=${messages.length}`);
        incoming = await res.json();
      }

      const older = mapDB(incoming);
      if (older.length > 0) {
        setMessages((prev) => {
          const map = new Map<string, Message>();
          [...prev, ...older].forEach((m) => map.set(m.id, m));
          const merged = Array.from(map.values()).sort(
            (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
          );
          return merged;
        });
        const newestOldest = older[older.length - 1].timestamp.toISOString();
        oldestCursorRef.current = newestOldest;
        // 初始化 newest 游标兜底
        if (!newestCursorRef.current) {
          newestCursorRef.current = older[0].timestamp.toISOString();
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBottomLoading(false);
      busyRef.current = false;
    }
  }, [messages.length]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // ------- 仅“顶/底拉动”触发更新，普通滚动不触发 ----------
  useEffect(() => {
    const root = document.scrollingElement || document.documentElement;

    const isAtTop = () => (root?.scrollTop ?? 0) <= 0;
    const isAtBottom = () => {
      const scrollTop = root?.scrollTop ?? 0;
      const clientH = root?.clientHeight ?? 0;
      const scrollH = root?.scrollHeight ?? 0;
      return scrollH - clientH - scrollTop <= 0;
    };

    const resetTopUI = () => {
      setTopReady(false);
      setTopPull(0);
    };
    const resetBottomUI = () => {
      setBottomReady(false);
      setBottomPull(0);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (busyRef.current) return;
      startYRef.current = e.touches[0].clientY;
      // 只有在顶部或底部才进入拉动模式
      if (isAtTop()) {
        pullingRef.current = true;
        pullModeRef.current = "top";
      } else if (isAtBottom()) {
        pullingRef.current = true;
        pullModeRef.current = "bottom";
      } else {
        pullingRef.current = false;
        pullModeRef.current = null;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current || busyRef.current) return;

      const dy = e.touches[0].clientY - startYRef.current;

      if (pullModeRef.current === "top") {
        if (dy > 0) {
          // 顶部下拉
          e.preventDefault(); // 需要 passive: false
          const d = Math.min(MAX_PULL, dy * DAMPING);
          setTopPull(d);
          const ready = d >= THRESHOLD;
          setTopReady(ready);
        } else {
          // 向上推回，取消
          resetTopUI();
        }
      } else if (pullModeRef.current === "bottom") {
        if (dy < 0) {
          // 底部上拉（dy 为负）
          e.preventDefault();
          const d = Math.min(MAX_PULL, -dy * DAMPING);
          setBottomPull(d);
          const ready = d >= THRESHOLD;
          setBottomReady(ready);
        } else {
          // 向下拉回，取消
          resetBottomUI();
        }
      }
    };

    const onTouchEnd = async () => {
      if (!pullingRef.current || busyRef.current) {
        resetTopUI();
        resetBottomUI();
        pullingRef.current = false;
        pullModeRef.current = null;
        return;
      }

      if (pullModeRef.current === "top") {
        if (topReady) {
          setTopLoading(true);
          setTopPull(48); // 固定 loading 高度
          await loadNewer();
        }
        setTopLoading(false);
        resetTopUI();
      } else if (pullModeRef.current === "bottom") {
        if (bottomReady) {
          setBottomLoading(true);
          setBottomPull(48);
          await loadOlder();
        }
        setBottomLoading(false);
        resetBottomUI();
      }

      pullingRef.current = false;
      pullModeRef.current = null;
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart as any);
      window.removeEventListener("touchmove", onTouchMove as any);
      window.removeEventListener("touchend", onTouchEnd as any);
    };
  }, [topReady, bottomReady, loadNewer, loadOlder]);

  // 发新帖：插入顶部并更新 newestCursor
  const handleAddMessage = async (content: string, author: string) => {
    try {
      const res = await fetch('/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: author || '匿名', content }),
      });
      const msg: DBMessage = await res.json();
      const newMessage: Message = {
        id: msg.id.toString(),
        content: msg.content,
        author: msg.username ?? '匿名',
        timestamp: new Date(msg.created_at),
        gradientType:
          gradientTypes[Math.floor(Math.random() * gradientTypes.length)],
      };
      setMessages((prev) => [newMessage, ...prev]);
      newestCursorRef.current = newMessage.timestamp.toISOString();
      if (!oldestCursorRef.current) {
        oldestCursorRef.current = newMessage.timestamp.toISOString();
      }
      setIsPostDialogOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-background overscroll-y-contain">
      {/* 顶部下拉提示/加载条（只在拉动或加载时占位） */}
      <div
        className="sticky top-0 z-20 flex items-center justify-center overflow-hidden"
        style={{ height: topLoading ? 48 : topPull }}
      >
        {(topPull > 0 || topLoading) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {topLoading ? (
              <>
                <span className="inline-block h-4 w-4 rounded-full border-2 border-muted-foreground/40 border-t-foreground animate-spin" />
                <span>正在获取最新…</span>
              </>
            ) : topReady ? (
              <span>松手刷新最新</span>
            ) : (
              <span>下拉刷新</span>
            )}
          </div>
        )}
      </div>

      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">墙</span>
              </div>
              <h1 className="text-xl font-bold text-foreground">我的墙</h1>
            </div>
            <div className="text-sm text-muted-foreground">
              {new Date().toLocaleDateString('zh-CN')}
            </div>
          </div>
        </div>
      </header>

      {/* 列表 */}
      <main className="max-w-2xl mx-auto px-4 py-6 pb-24">
        <div className="space-y-4">
          {messages.slice(0, PAGE_SIZE) /* 初屏只需骨架时可控制，这里直接展示全部当前已载入的 */ &&
            messages.map((m) => <MessageCard key={m.id} message={m} />)}
        </div>

        {/* 底部上拉提示/加载条（只在拉动或加载时占位） */}
        <div
          className="sticky bottom-0 z-20 flex items-center justify-center overflow-hidden"
          style={{ height: bottomLoading ? 48 : bottomPull }}
        >
          {(bottomPull > 0 || bottomLoading) && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {bottomLoading ? (
                <>
                  <span className="inline-block h-4 w-4 rounded-full border-2 border-muted-foreground/40 border-t-foreground animate-spin" />
                  <span>正在加载更早的留言…</span>
                </>
              ) : bottomReady ? (
                <span>松手加载更早</span>
              ) : (
                <span>上拉加载</span>
              )}
            </div>
          )}
        </div>

        {/* 普通滚动行为下不触发任何加载，这里不显示“没有更多了”以免误导 */}
      </main>

      {/* 悬浮发帖 */}
      <div className="fixed bottom-6 right-6 z-20">
        <Button
          onClick={() => setIsPostDialogOpen(true)}
          size="lg"
          className="h-14 w-14 rounded-full bg-gradient-to-br from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-lg hover:shadow-xl transition-all duration-300 border-0"
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>

      <PostMessageDialog
        open={isPostDialogOpen}
        onOpenChange={setIsPostDialogOpen}
        onSubmit={handleAddMessage}
      />
    </div>
  );
};
