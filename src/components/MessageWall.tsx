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
  gradientType: "purple" | "cyan" | "green" | "orange";
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
  // 仅渲染前 renderCount 条：10 → 20 → 30 ...
  const [renderCount, setRenderCount] = useState(PAGE_SIZE);
  const [isPostDialogOpen, setIsPostDialogOpen] = useState(false);

  // 底部上拉 UI 状态
  const [bottomPull, setBottomPull] = useState(0);
  const [bottomReady, setBottomReady] = useState(false);
  const [bottomLoading, setBottomLoading] = useState(false);

  // 是否还有更多（为 false 后完全不再触发加载）
  const [hasMore, setHasMore] = useState(true);

  // 游标：当前已加载里“最老”的时间戳
  const oldestCursorRef = useRef<string | null>(null);

  // 手势/并发控制
  const pullingRef = useRef(false);
  const pullModeRef = useRef<PullMode>(null);
  const startYRef = useRef(0);
  const busyRef = useRef(false);

  const gradientTypes: Array<"purple" | "cyan" | "green" | "orange"> = [
    "purple",
    "cyan",
    "green",
    "orange",
  ];

  const mapDB = (rows: DBMessage[]): Message[] =>
    rows.map((msg) => ({
      id: msg.id.toString(),
      content: msg.content,
      author: msg.username ?? "匿名",
      timestamp: new Date(msg.created_at),
      gradientType: gradientTypes[Math.floor(Math.random() * gradientTypes.length)],
    }));

  // 初始加载：仅取最新 PAGE_SIZE 条，且只渲染 PAGE_SIZE 条
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

      if (list.length < PAGE_SIZE) {
        setHasMore(false); // 一开始就不满一页，直接认为已全部加载
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // 底部加载更老：严格一页一页往下翻；去重后判断是否还有更多
  const loadOlder = useCallback(async () => {
    if (busyRef.current || !hasMore) return;
    if (!oldestCursorRef.current && messages.length === 0) return;

    busyRef.current = true;
    setBottomLoading(true);
    try {
      let incoming: DBMessage[] = [];
      if (oldestCursorRef.current) {
        const res = await fetch(
          `/messages?limit=${PAGE_SIZE}&before=${encodeURIComponent(
            oldestCursorRef.current,
          )}`,
        );
        incoming = await res.json();
      } else {
        // 兜底：offset 模式
        const res = await fetch(`/messages?limit=${PAGE_SIZE}&offset=${messages.length}`);
        incoming = await res.json();
      }

      const older = mapDB(incoming).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // 去重后计算真实新增
      const idSet = new Set(messages.map((m) => m.id));
      const toAdd = older.filter((o) => !idSet.has(o.id));

      if (toAdd.length > 0) {
        setMessages((prev) =>
          [...prev, ...toAdd].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
        );
        setRenderCount((c) => c + toAdd.length);

        // 仅在有新增时更新最老游标
        oldestCursorRef.current = toAdd[toAdd.length - 1].timestamp.toISOString();
      }

      // 收口条件：真实新增不足一页，或为 0，则后续不再加载
      if (toAdd.length < PAGE_SIZE) {
        setHasMore(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBottomLoading(false);
      busyRef.current = false;
    }
  }, [messages, hasMore]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // 仅在 hasMore === true 时绑定“底部上拉”手势；加载完后彻底不再绑定
  useEffect(() => {
    if (!hasMore) return;

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
  }, [hasMore, bottomReady, loadOlder]);

  // 发新帖：插入顶部、renderCount+1；不影响向下“翻旧消息”的游标和 hasMore
  const handleAddMessage = async (content: string, author: string) => {
    try {
      const res = await fetch("/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: author || "匿名", content }),
      });
      const msg: DBMessage = await res.json();
      const newMessage: Message = {
        id: msg.id.toString(),
        content: msg.content,
        author: msg.username ?? "匿名",
        timestamp: new Date(msg.created_at),
        gradientType: gradientTypes[Math.floor(Math.random() * gradientTypes.length)],
      };

      setMessages((prev) =>
        [newMessage, ...prev].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
      );
      setRenderCount((c) => c + 1);

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
              {new Date().toLocaleDateString("zh-CN")}
            </div>
          </div>
        </div>
      </header>

      {/* 列表 */}
      <main className="max-w-2xl mx-auto px-4 py-6 pb-28">
        <div className="space-y-4">
          {messages.slice(0, renderCount).map((m) => (
            <MessageCard key={m.id} message={m} />
          ))}
        </div>

        {/* 底部上拉提示/加载条（仅在 hasMore 时显示） */}
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

        {/* 桌面端/通用“加载更多”（仅在 hasMore 时显示；加载完则替换为提示） */}
        {hasMore ? (
          <div className="mt-6 flex justify-center">
            <Button variant="outline" disabled={bottomLoading} onClick={loadOlder}>
              {bottomLoading ? "加载中…" : `加载更早的 ${PAGE_SIZE} 条`}
            </Button>
          </div>
        ) : (
          <div className="mt-6 text-sm text-muted-foreground text-center">— 已加载全部 —</div>
        )}
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
