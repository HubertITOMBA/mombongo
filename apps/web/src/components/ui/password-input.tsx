"use client";
import { useId, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordInput({ label, className, id, ...props }: Omit<ComponentProps<"input">, "type"> & { label: string }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <Label htmlFor={inputId}>{label}</Label>
      <div className="relative mt-2">
        <Input {...props} id={inputId} type={visible ? "text" : "password"} className={cn("pr-12", className)} />
        <button
          type="button"
          disabled={props.disabled}
          aria-label={`${visible ? "Masquer" : "Afficher"} : ${label}`}
          aria-controls={inputId}
          aria-pressed={visible}
          onClick={() => setVisible(value => !value)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
        >
          {visible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
