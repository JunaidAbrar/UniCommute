import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Home, MessageSquare, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function BottomNav() {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();

  if (!user || location === "/auth") return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t bg-background">
      <div className="flex justify-around p-2">
        <Link href="/">
          <a
            className={cn(
              "flex flex-col items-center p-2 text-sm",
              location === "/" ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Home className="h-5 w-5" />
            <span>Home</span>
          </a>
        </Link>
        
        <button
          onClick={() => logoutMutation.mutate()}
          className="flex flex-col items-center p-2 text-sm text-muted-foreground"
        >
          <LogOut className="h-5 w-5" />
          <span>Logout</span>
        </button>
      </div>
    </nav>
  );
}
