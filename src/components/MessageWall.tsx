import { useState, useEffect } from "react";
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

// The shape returned by the backend for a single message
interface DBMessage {
  id: number;
  username: string | null;
  content: string;
  created_at: string;
}

export const MessageWall = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isPostDialogOpen, setIsPostDialogOpen] = useState(false);

  const gradientTypes: Array<'purple' | 'cyan' | 'green' | 'orange'> = ['purple', 'cyan', 'green', 'orange'];

  const handleAddMessage = (content: string, author: string) => {
    // Send the new message to the backend. The backend will return the saved record.
    fetch('/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: author || '匿名', content })
    })
      .then(res => res.json())
      .then((msg: DBMessage) => {
        const newMessage: Message = {
          id: msg.id.toString(),
          content: msg.content,
          author: msg.username ?? '匿名',
          timestamp: new Date(msg.created_at),
          gradientType: gradientTypes[Math.floor(Math.random() * gradientTypes.length)]
        };
        setMessages(prev => [newMessage, ...prev]);
        setIsPostDialogOpen(false);
      })
      .catch(err => {
        console.error(err);
      });
  };

  // Load existing messages when the component mounts
  useEffect(() => {
    fetch('/messages')
      .then(res => res.json())
      .then((data: DBMessage[]) => {
        setMessages(
          data.map(msg => ({
            id: msg.id.toString(),
            content: msg.content,
            author: msg.username ?? '匿名',
            timestamp: new Date(msg.created_at),
            gradientType: gradientTypes[Math.floor(Math.random() * gradientTypes.length)]
          }))
        );
      })
      .catch(err => {
        console.error(err);
      });
  }, []);

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
