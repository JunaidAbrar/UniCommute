import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Home, LogOut, User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function BottomNav() {
  const [location, navigate] = useLocation();
  const { user, logoutMutation } = useAuth();

  if (!user || location === "/auth") return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t bg-background/80 backdrop-blur-sm">
      <div className="flex justify-around p-2">
        <button
          onClick={() => navigate("/")}
          className={cn(
            "flex flex-col items-center p-2 text-sm",
            location === "/" ? "text-primary" : "text-muted-foreground"
          )}
        >
          <Home className="h-5 w-5" />
          <span>Home</span>
        </button>

        <button
          onClick={() => navigate("/profile")}
          className={cn(
            "flex flex-col items-center p-2 text-sm",
            location === "/profile" ? "text-primary" : "text-muted-foreground"
          )}
        >
          <User className="h-5 w-5" />
          <span>Profile</span>
        </button>

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