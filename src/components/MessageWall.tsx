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

type PullMode = null | "bottom";

export const MessageWall = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  // 控制“当前渲染条数”：10 → 20 → 30 ...
  const [renderCount, setRenderCount] = useState(PAGE_SIZE);
  const [isPostDialogOpen, setIsPostDialogOpen] = useState(false);

  // 底部上拉 UI 状态
  const [bottomPull, setBottomPull] = useState(0);
  const [bottomReady, setBottomReady] = useState(false);
  const [bottomLoading, setBottomLoading] = useState(false);

  // 是否还有更多老消息
  const [hasMore, setHasMore] = useState(true);

  // 游标：最老
  const oldestCursorRef = useRef<string | null>(null);

  // 手势 refs
  const pullingRef = useRef(false);
  const pullModeRef = useRef<PullMode>(null);
  const startYRef = useRef(0);
  const busyRef = useRef(false); // 任一加载中，避免并发

  const gradientTypes: Array<'purple' | 'cyan' | 'green' | 'orange'> = [
    'purple', 'cyan', 'green', 'orange'
  ];

  // -------- 配色稳定：由 id 派生，不再随机 --------
  const hashString = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h << 5) - h + s.charCodeAt(i);
      h |= 0; // 32-bit
    }
    return Math.abs(h);
  };

  const pickGradient = (id: string) =>
    gradientTypes[hashString(id) % gradientTypes.length];

  const mapDB = (rows: DBMessage[]): Message[] =>
    rows.map((msg) => ({
      id: msg.id.toString(),
      content: msg.content,
      author: msg.username ?? '匿名',
      timestamp: new Date(msg.created_at),
      gradientType: pickGradient(msg.id.toString()),
    }));

  // 初始只取最新 10 条（服务端不支持 limit 时也仅渲染 10 条）
  const loadInitial = useCallback(async () => {
    try {
      const res = await fetch(`/messages?limit=${PAGE_SIZE}`);
      const data: DBMessage[] = await res.json();
      const list = mapDB(data).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      setMessages(list);
      setRenderCount(Math.min(PAGE_SIZE, list.length));

      if (list.length > 0) {
        oldestCursorRef.current = list[list.length - 1].timestamp.toISOString();
      }
      // 如果一开始就不足 10 条，直接标记没有更多
      if (list.length < PAGE_SIZE) {
        setHasMore(false);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // 仅“底部上拉”加载更老（before 游标）；回退 offset；合并并增加 renderCount（只按真正新增的条数增加）
  const loadOlder = useCallback(async () => {
    if (busyRef.current || !hasMore) return;
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

      const older = mapDB(incoming).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      if (older.length > 0) {
        let added = 0;
        let newOldestCursor: string | null = null;

        setMessages((prev) => {
          const exist = new Set(prev.map((m) => m.id));
          const dedupOlder = older.filter((m) => !exist.has(m.id));
          added = dedupOlder.length;
          if (older.length > 0) {
            newOldestCursor = older[older.length - 1].timestamp.toISOString();
          }
          const merged = [...prev, ...dedupOlder].sort(
            (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
          );
          return merged;
        });

        if (added > 0) {
          setRenderCount((c) => c + added);
        }

        if (newOldestCursor) {
          oldestCursorRef.current = newOldestCursor;
        }

        // 若本次返回不足 PAGE_SIZE，说明没有更多了
        if (older.length < PAGE_SIZE) {
          setHasMore(false);
        }
      } else {
        // 没有任何返回，也认为没有更多了
        setHasMore(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBottomLoading(false);
      busyRef.current = false;
    }
  }, [messages.length, hasMore]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // ------- 仅“底部上拉”触发加载 ----------
  useEffect(() => {
    const root = document.scrollingElement || document.documentElement;

    const isAtBottom = () => {
      const scrollTop = root?.scrollTop ?? 0;
      const clientH = root?.clientHeight ?? 0;
      const scrollH = root?.scrollHeight ?? 0;
      return scrollH - clientH - scrollTop <= 0;
    };

    const resetBottomUI = () => {
      setBottomReady(false);
      setBottomPull(0);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (busyRef.current || !hasMore) return;
      const touchY = e.touches[0].clientY;
      startYRef.current = touchY;
      if (isAtBottom()) {
        pullingRef.current = true;
        pullModeRef.current = "bottom";
      } else {
        pullingRef.current = false;
        pullModeRef.current = null;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current || busyRef.current || !hasMore) return;
      const dy = e.touches[0].clientY - startYRef.current;

      // 仅“底部上拉加载”
      if (pullModeRef.current === "bottom") {
        if (dy < 0) {
          e.preventDefault(); // 需要 passive:false
          const d = Math.min(MAX_PULL, -dy * DAMPING);
          setBottomPull(d);
          setBottomReady(d >= THRESHOLD);
        } else {
          resetBottomUI();
        }
      }
    };

    const onTouchEnd = async () => {
      if (!pullingRef.current || busyRef.current) {
        resetBottomUI();
        pullingRef.current = false;
        pullModeRef.current = null;
        return;
      }

      if (pullModeRef.current === "bottom") {
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
  }, [bottomReady, loadOlder, hasMore]);

  // 发新帖：插入顶部、renderCount+1（可立即看到），不影响“底部加载老消息”的游标
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
        gradientType: pickGradient(msg.id.toString()),
      };
      setMessages((prev) => [newMessage, ...prev].sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
      ));
      setRenderCount((c) => c + 1);
      // 最老游标不更新（只负责向下翻旧消息）
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
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">槽</span>
              </div>
              <h1 className="text-xl font-bold text-foreground">吐槽墙</h1>
            </div>
            <div className="text-sm text-muted-foreground">
              {new Date().toLocaleDateString('zh-CN')}
            </div>
          </div>
        </div>
      </header>

      {/* 列表 */}
      <main className="max-w-2xl mx-auto px-4 py-6 pb-28">
        <div className="space-y-4">
          {/* 仅渲染 renderCount 条 */}
          {messages.slice(0, renderCount).map((m) => (
            <MessageCard key={m.id} message={m} />
          ))}
        </div>

        {/* 底部上拉提示/加载条（移动端上拉触发） */}
        {hasMore && (
          <div
            className="sticky bottom-16 z-20 flex items-center justify-center overflow-hidden"
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
        )}

        {/* 桌面端/通用的“加载更多”按钮（可与上拉二选一使用） */}
        <div className="mt-6 flex justify-center">
          {hasMore ? (
            <Button
              variant="outline"
              disabled={bottomLoading}
              onClick={() => loadOlder()}
            >
              {bottomLoading ? "加载中…" : `加载更早信息`}
            </Button>
          ) : (
            <div className="text-sm text-muted-foreground py-2">— 没有更多了 —</div>
          )}
        </div>
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
