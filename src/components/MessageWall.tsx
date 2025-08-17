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
  created_at: string; // ISO string
}

const PAGE_SIZE = 10;

export const MessageWall = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isPostDialogOpen, setIsPostDialogOpen] = useState(false);

  // 分页相关
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const oldestCursorRef = useRef<string | null>(null); // 记录当前列表里最老一条的 created_at
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const gradientTypes: Array<'purple' | 'cyan' | 'green' | 'orange'> = [
    'purple', 'cyan', 'green', 'orange'
  ];

  const mapDB = (rows: DBMessage[]) =>
    rows.map((msg) => ({
      id: msg.id.toString(),
      content: msg.content,
      author: msg.username ?? '匿名',
      timestamp: new Date(msg.created_at),
      gradientType:
        gradientTypes[Math.floor(Math.random() * gradientTypes.length)],
    }));

  // 初始拉取 10 条
  const loadInitial = useCallback(async () => {
    try {
      setIsInitialLoading(true);
      const res = await fetch(`/messages?limit=${PAGE_SIZE}`);
      const data: DBMessage[] = await res.json();
      const list = mapDB(data);
      setMessages(list);

      if (list.length > 0) {
        const oldest = list[list.length - 1].timestamp.toISOString();
        oldestCursorRef.current = oldest;
      }
      setHasMore(data.length === PAGE_SIZE); // 少于 10 则没有更多
    } catch (e) {
      console.error(e);
    } finally {
      setIsInitialLoading(false);
    }
  }, []);

  // 加载更多（更老）
  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore) return;
    const before = oldestCursorRef.current;
    if (!before) return;

    try {
      setIsLoadingMore(true);
      const res = await fetch(
        `/messages?limit=${PAGE_SIZE}&before=${encodeURIComponent(before)}`
      );
      const data: DBMessage[] = await res.json();
      const more = mapDB(data);

      if (more.length > 0) {
        setMessages((prev) => [...prev, ...more]);
        const newestOldest = more[more.length - 1].timestamp.toISOString();
        oldestCursorRef.current = newestOldest;
      }
      if (more.length < PAGE_SIZE) setHasMore(false);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore]);

  // 监听底部哨兵，进入视口则加载更多
  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "200px 0px 200px 0px" } // 提前 200px 预加载
    );

    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  // 初始加载
  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // 提交新消息：添加到顶部，不影响旧分页
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
      setIsPostDialogOpen(false);
      // 注意：不重置游标，这样底部继续加载仍是“更老”的
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

      {/* Message Feed */}
      <main className="max-w-2xl mx-auto px-4 py-6 pb-24">
        {/* 初始加载骨架 */}
        {isInitialLoading && messages.length === 0 ? (
          <div className="space-y-3">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {messages.map((message) => (
                <MessageCard key={message.id} message={message} />
              ))}
            </div>

            {/* 底部：加载更多 / 没有更多 */}
            <div ref={bottomRef} className="py-8 text-center">
              {isLoadingMore ? (
                <div className="inline-flex items-center gap-2 text-muted-foreground">
                  <span className="inline-block h-4 w-4 rounded-full border-2 border-muted-foreground/40 border-t-foreground animate-spin" />
                  <span>正在加载更早的留言…</span>
                </div>
              ) : hasMore ? (
                <p className="text-muted-foreground text-sm">上拉到底部，松手自动加载</p>
              ) : (
                <p className="text-muted-foreground text-sm">没有更多了</p>
              )}
            </div>
          </>
        )}
      </main>

      {/* Floating Action Button */}
      <div className="fixed bottom-6 right-6 z-20">
        <Button
          onClick={() => setIsPostDialogOpen(true)}
          size="lg"
          className="h-14 w-14 rounded-full bg-gradient-to-br from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-lg hover:shadow-xl transition-all duration-300 border-0"
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>

      {/* Post Message Dialog */}
      <PostMessageDialog
        open={isPostDialogOpen}
        onOpenChange={setIsPostDialogOpen}
        onSubmit={handleAddMessage}
      />
    </div>
  );
};
