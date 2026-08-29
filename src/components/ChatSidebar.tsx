import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ChatSidebarContent, type ChatSidebarProps } from "@/components/ChatSidebarContent";

const MIN_WIDTH = 200;
const MAX_WIDTH = 500;

export function ChatSidebar(props: ChatSidebarProps) {
  const [width, setWidth] = useState(270);
  const draggingRef = useRef(false);

  const onPointerDown = useCallback(() => {
    draggingRef.current = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!draggingRef.current) return;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, event.clientX)));
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  return (
    <aside
      className="relative hidden shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex lg:flex-col"
      style={{ width }}
    >
      <ChatSidebarContent {...props} />
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Ajustar largura do painel"
        onPointerDown={onPointerDown}
        className="absolute inset-y-0 -right-1 w-2 cursor-col-resize hover:bg-primary/40"
      />
    </aside>
  );
}

export function ChatSidebarSheet(
  props: ChatSidebarProps & {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  },
) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = props.open ?? internalOpen;
  const setOpen = props.onOpenChange ?? setInternalOpen;

  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Abrir conversas e configurações">
          <PanelLeft />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[88vw] max-w-sm p-0">
        <SheetTitle className="sr-only">Conversas e configurações</SheetTitle>
        <ChatSidebarContent
          {...props}
          onSelect={(id) => {
            props.onSelect(id);
            close();
          }}
          onNew={() => {
            props.onNew();
            close();
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
