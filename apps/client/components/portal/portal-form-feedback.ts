import { toast } from "sonner";

export function announceSuccess(message: string, setNotice: (value: string) => void): void {
  setNotice(message);
  toast.success(message);
}
