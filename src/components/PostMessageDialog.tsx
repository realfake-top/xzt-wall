import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface PostMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (content: string, author: string) => void;
}

/**
 * Dialog component for posting a new message. The author's nickname is cached
 * locally so the user doesn't need to re-enter it each time. Success toast
 * notification has been removed.
 */
export const PostMessageDialog = ({ open, onOpenChange, onSubmit }: PostMessageDialogProps) => {
  const [content, setContent] = useState("");
  // Initialize the author from localStorage so the nickname persists across uses
  const [author, setAuthor] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("nickname") || "";
    }
    return "";
  });

  // Persist nickname to localStorage whenever it changes
  useEffect(() => {
    if (author) {
      localStorage.setItem("nickname", author);
    }
  }, [author]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) {
      toast({
        title: "请输入消息内容",
        variant: "destructive"
      });
      return;
    }

    if (content.length > 500) {
      toast({
        title: "消息内容不能超过500字",
        variant: "destructive"
      });
      return;
    }

    // Submit the message; default to 匿名 when author is empty
    onSubmit(content.trim(), author.trim() || "匿名");
    setContent("");
    // Do not reset author so the nickname persists for the next message
    // Success toast removed per request
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">发布新消息</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="content">消息内容</Label>
            <Textarea
              id="content"
              placeholder="写下你想说的话..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[120px] resize-none"
              maxLength={500}
            />
            <div className="text-xs text-muted-foreground text-right">
              {content.length}/500
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="author">昵称（可选）</Label>
            <Input
              id="author"
              placeholder="小纸条"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              maxLength={20}
            />
            <div className="text-xs text-muted-foreground">留空将显示为"匿名"</div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              取消
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90"
            >
              <Send className="w-4 h-4 mr-2" />
              发布
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
