import { useState, useEffect, useRef } from "react";
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
  created_at: string;
}

export const MessageWall = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isPostDialogOpen, setIsPostDialogOpen] = useState(false);

  // 下拉刷新 UI 状态
  const [pullDistance, setPullDistance] = useState(0);         // 可视下拉距离（像素）
  const [isRefreshing, setIsRefreshing] = useState(false);     // 正在刷新
  const [canRefresh, setCanRefresh] = useState(false);         // 达到阈值可刷新

  // 逻辑用的 ref（避免闭包拿到旧值）
  const pullingRef = useRef(false);
  const startYRef = useRef(0);
  const canRefreshRef = useRef(false);
  const refreshingRef = useRef(false);

  // 设置
  const gradientTypes: Array<'purple' | 'cyan' | 'green' | 'orange'> = [
    'purple', 'cyan', 'green', 'orange'
  ];
  const MAX_PULL = 120;     // 最大可视下拉距离（阻尼后）
  const THRESHOLD = 60;     // 触发刷新的阈值（像素）
  const DAMPING = 0.5;      // 阻尼系数，越小越“重”

  // 拉取消息
  const loadMessages = async () => {
    try {
      const res = await fetch('/messages');
      const data: DBMessage[] = await res.json();
      setMessages(
        data.map((msg) => ({
          id: msg.id.toString(),
          content: msg.content,
          author: msg.username ?? '匿名',
          timestamp: new Date(msg.created_at),
          gradientType:
            gradientTypes[Math.floor(Math.random() * gradientTypes.length)],
        }))
      );
    } catch (err) {
      console.error(err);
    }
  };

  // 提交新消息
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
    } catch (err) {
      console.error(err);
    }
  };

  // 初始加载 + 顶部回到近顶部时的自动刷新（可选）
  useEffect(() => {
    loadMessages();

    const onScroll = () => {
      const top =
        (document.documentElement && document.documentElement.scrollTop) ||
        document.body.scrollTop ||
        0;
      if (top <= 50 && !refreshingRef.current) {
        // 接近顶部，轻量触发刷新（防抖需求可自行增加）
        loadMessages();
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // 下拉刷新手势（移动端优化）
  useEffect(() => {
    const el = document.scrollingElement || document.documentElement;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      const scrollTop = (el?.scrollTop ?? 0);
      if (scrollTop <= 0) {
        pullingRef.current = true;
        startYRef.current = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current || refreshingRef.current) return;

      const dy = e.touches[0].clientY - startYRef.current;
      if (dy > 0) {
        // 阻止页面回弹滚动，提升交互（必须 passive: false）
        e.preventDefault();

        // 阻尼
        const damped = Math.min(MAX_PULL, dy * DAMPING);
        setPullDistance(damped);

        const ok = damped >= THRESHOLD;
        setCanRefresh(ok);
        canRefreshRef.current = ok;
      }
    };

    const finishReset = () => {
      setCanRefresh(false);
      canRefreshRef.current = false;
      setPullDistance(0);
      pullingRef.current = false;
    };

    const onTouchEnd = async () => {
      if (!pullingRef.current || refreshingRef.current) {
        finishReset();
        return;
      }

      if (canRefreshRef.current) {
        // 触发刷新
        refreshingRef.current = true;
        setIsRefreshing(true);

        // 保持一个固定高度展示 loading
        setPullDistance(48);

        try {
          await loadMessages();
        } finally {
          setIsRefreshing(false);
          refreshingRef.current = false;
          finishReset();
        }
      } else {
        finishReset();
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart as any);
      window.removeEventListener('touchmove', onTouchMove as any);
      window.removeEventListener('touchend', onTouchEnd as any);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background overscroll-y-contain">
      {/* 顶部吸附的下拉刷新提示区 */}
      <div
        className="sticky top-0 z-20 flex items-center justify-center overflow-hidden"
        style={{ height: isRefreshing ? 48 : pullDistance }}
      >
        {pullDistance > 0 || isRefreshing ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {isRefreshing ? (
              <>
                <span className="inline-block h-4 w-4 rounded-full border-2 border-muted-foreground/40 border-t-foreground animate-spin" />
                <span>正在刷新…</span>
              </>
            ) : canRefresh ? (
              <span>松手刷新</span>
            ) : (
              <span>下拉刷新</span>
            )}
          </div>
        ) : null}
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

      {/* Message Feed */}
      <main className="max-w-2xl mx-auto px-4 py-6 pb-24">
        <div className="space-y-4">
          {messages.map((message) => (
            <MessageCard key={message.id} message={message} />
          ))}
        </div>

        {/* Load More */}
        <div className="text-center py-8">
          <p className="text-muted-foreground text-sm">上拉可以获取更多...</p>
        </div>
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
