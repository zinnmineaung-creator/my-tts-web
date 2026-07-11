import { useGetMe } from "@workspace/api-client-react";
import { useAuthToken } from "@/lib/auth";
import { Auth } from "@/components/Auth";
import { Studio } from "@/components/Studio";
import { Spinner } from "@/components/ui/spinner";
import { useEffect } from "react";

export default function Home() {
  const { token, removeToken } = useAuthToken();
  const { data: user, isLoading, isError } = useGetMe({
    query: {
      enabled: !!token,
      queryKey: ["/api/auth/me", token], // Use token in query key to refetch when token changes
    },
  });

  useEffect(() => {
    if (isError) {
      removeToken();
    }
  }, [isError, removeToken]);

  if (token && isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-primary font-bold shadow-inner">
              MM
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Myanmar TTS
            </h1>
          </div>
          {user && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{user.displayName}</span>
                {user.isVip && (
                  <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-bold tracking-wide">
                    VIP
                  </span>
                )}
              </div>
              <button 
                onClick={removeToken}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </header>
      
      <main className="flex-1 container max-w-6xl mx-auto px-4 py-8">
        {user ? <Studio user={user} /> : <Auth />}
      </main>
    </div>
  );
}
