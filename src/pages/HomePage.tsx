import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ensureThread } from "@/lib/chat-store";

export function HomePage() {
  const navigate = useNavigate();

  useEffect(() => {
    const { activeId } = ensureThread();
    navigate(`/c/${activeId}`, { replace: true });
  }, [navigate]);

  return (
    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
      Carregando ConsBOT...
    </div>
  );
}
