import { Card } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

interface Message {
  id: string;
  content: string;
  author: string;
  timestamp: Date;
  gradientType: 'purple' | 'cyan' | 'green' | 'orange';
}

interface MessageCardProps {
  message: Message;
}

const gradientClasses = {
  purple: "bg-gradient-to-br from-gradient-purple-light to-gradient-purple text-white",
  cyan: "bg-gradient-to-br from-gradient-cyan-light to-gradient-cyan text-slate-800",
  green: "bg-gradient-to-br from-gradient-green-light to-gradient-green text-slate-800",
  orange: "bg-gradient-to-br from-gradient-orange-light to-gradient-orange text-slate-800"
};

export const MessageCard = ({ message }: MessageCardProps) => {
  const timeAgo = formatDistanceToNow(message.timestamp, { 
    addSuffix: true, 
    locale: zhCN 
  });

  return (
    <Card className={`p-4 mb-4 border-0 shadow-sm transition-all duration-300 hover:shadow-md hover:scale-[1.02] ${gradientClasses[message.gradientType]}`}>
      <div className="space-y-3">
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
        <div className="flex justify-between items-center text-xs opacity-80">
          <span className="font-medium">{message.author}</span>
          <span>{timeAgo}</span>
        </div>
      </div>
    </Card>
  );
};