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

export const MessageWall = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [renderCount, setRenderCount] = useState(PAGE_SIZE);
  const [isPostDialogOpen, setIsPostDialogOpen] = useState(false);

  // 下拉刷新逻辑移除，改为底部无限加载
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true); // 是否还有更多老数据

  // 游标：最新与最老
  const newestCursorRef = useRef<string | null>(null);
  const oldestCursorRef = useRef<string | null>(null);

  // 并发保护
  const busyRef = useRef(false);

  // 触底观察哨兵
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

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

  // 初始加载：取最新 N 条
  const loadInitial = useCallback(async () => {
    try {
      const res = await fetch(`/messages?limit=${PAGE_SIZE}`);
      const data: DBMessage[] = await res.json();
      const list = mapDB(data).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      setMessages(list);
      setRenderCount(Math.min(PAGE_SIZE, list.length));
      setHasMore(list.length === PAGE_SIZE); // 如果不足一页，说明没有更多

      if (list.length > 0) {
        newestCursorRef.current = list[0].timestamp.toISOString();
        oldestCursorRef.current = list[list.length - 1].timestamp.toISOString();
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // 触底后加载更老（before 游标）
  const loadOlder = useCallback(async () => {
    if (busyRef.current || !hasMore) return;
    if (!oldestCursorRef.current && messages.length === 0) return;

    busyRef.current = true;
    setLoadingMore(true);
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
        setMessages((prev) => {
          const map = new Map<string, Message>();
          [...prev, ...older].forEach((m) => map.set(m.id, m));
          return Array.from(map.values()).sort(
            (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
          );
        });
        setRenderCount((c) => c + older.length);
        oldestCursorRef.current = older[older.length - 1].timestamp.toISOString();
        if (!newestCursorRef.current) {
          newestCursorRef.current = older[0].timestamp.toISOString();
        }
      }

      // 如果返回不足 PAGE_SIZE，认为没有更多
      if (older.length < PAGE_SIZE) {
        setHasMore(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
      busyRef.current = false;
    }
  }, [messages.length, hasMore]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // 监听底部哨兵，自动触发加载更多
  useEffect(() => {
    if (!sentinelRef.current) return;

    // 清理旧 observer
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          // 进入视口 -> 触发加载
          loadOlder();
        }
      },
      {
        root: null,          // 视口
        rootMargin: "0px 0px 200px 0px", // 提前 200px 触发
        threshold: 0.01,
      }
    );

    observerRef.current.observe(sentinelRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [loadOlder]);

  // 发新帖：插入顶部、更新 newestCursor
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
      // 不强制增加 renderCount：保持“先看到旧的，再滚动加载”的体验
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
    <div className="min-h-screen bg-background">
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
      <main className="max-w-2xl mx-auto px-4 py-6 pb-24">
        <div className="space-y-4">
          {messages.slice(0, renderCount).map((m) => (
            <MessageCard key={m.id} message={m} />
          ))}
        </div>

        {/* 底部哨兵 & 状态 */}
        <div ref={sentinelRef} className="h-12 flex items-center justify-center">
          {loadingMore ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-block h-4 w-4 rounded-full border-2 border-muted-foreground/40 border-t-foreground animate-spin" />
              <span>正在加载更多…</span>
            </div>
          ) : !hasMore ? (
            <div className="text-sm text-muted-foreground">没有更多了</div>
          ) : (
            <div className="text-sm text-muted-foreground">下拉滚动以加载更多</div>
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
