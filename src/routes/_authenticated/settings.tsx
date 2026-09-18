import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSettings, useStatuses, useTemperatures } from "@/hooks/use-meta";
import { toast } from "sonner";
import { Copy, Check, RefreshCw, KeyRound, Globe } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings - TeleNexus Lead Manager" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data: s } = useSettings();
  const { data: statuses } = useStatuses();
  const { data: temps } = useTemperatures();
  const [perCaller, setPerCaller] = useState(50);
  const [autoRefill, setAutoRefill] = useState(false);
  const [phone10, setPhone10] = useState(true);
  const [webhookToken, setWebhookToken] = useState("tnx_live_9f83a219bc84d4e0a72c");
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    if (s) {
      setPerCaller(s.leads_per_telecaller);
      setAutoRefill(s.auto_refill);
      setPhone10((s as any).enforce_10_digit_phone ?? true);
      if ((s as any).wp_webhook_token) {
        setWebhookToken((s as any).wp_webhook_token);
      }
    }
  }, [s]);

  const webhookUrl = typeof window !== "undefined" 
    ? `${window.location.origin}/api/v1/leads/webhook` 
    : "/api/v1/leads/webhook";

  const handleCopy = (text: string, type: "token" | "url") => {
    navigator.clipboard.writeText(text);
    if (type === "token") {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
      toast.success("Unique code copied to clipboard!");
    } else {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
      toast.success("Webhook URL copied to clipboard!");
    }
  };

  const generateNewToken = () => {
    const randomHex = Array.from({ length: 16 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
    const newToken = `tnx_live_${randomHex}`;
    setWebhookToken(newToken);
    toast.info("Generated new token. Remember to click Save.");
  };

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("crm_settings").update({
        leads_per_telecaller: perCaller,
        auto_refill: autoRefill,
        enforce_10_digit_phone: phone10,
        wp_webhook_token: webhookToken,
      } as any).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => { 
      toast.success("Settings saved successfully"); 
      qc.invalidateQueries({ queryKey: ["crm_settings"] }); 
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Distribution rules, integrations, and lead taxonomy.</p>
      </div>

      {/* WordPress & Webhook Lead Integration */}
      <Card className="p-5 space-y-4 border-primary/20 bg-gradient-to-br from-card to-primary/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            <div className="font-semibold text-base">WordPress Lead Connect (Privyr Model)</div>
          </div>
          <span className="text-xs bg-primary/10 text-primary font-medium px-2.5 py-1 rounded-full">
            Contact Form 7 Active
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Use these credentials in your WordPress <strong>TeleNexus Leads Connect</strong> plugin to sync Contact Form 7 inquiries directly into TeleNexus in real-time.
        </p>

        <div className="space-y-3 pt-2">
          <div>
            <Label className="text-xs font-medium text-muted-foreground">Unique Account / Integration Code</Label>
            <div className="flex items-center gap-2 mt-1">
              <div className="relative flex-1">
                <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  readOnly 
                  value={webhookToken} 
                  className="pl-9 font-mono text-xs bg-background/70"
                />
              </div>
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={() => handleCopy(webhookToken, "token")}
                className="gap-1.5"
              >
                {copiedToken ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                {copiedToken ? "Copied" : "Copy Code"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={generateNewToken}
                title="Generate new token"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium text-muted-foreground">Travel Site Webhook Ingestion URL</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input 
                readOnly 
                value={webhookUrl} 
                className="font-mono text-xs bg-background/70"
              />
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={() => handleCopy(webhookUrl, "url")}
                className="gap-1.5"
              >
                {copiedUrl ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                {copiedUrl ? "Copied" : "Copy URL"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="font-semibold">Lead Distribution</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Default leads per telecaller</Label>
            <Input type="number" min={1} value={perCaller} onChange={(e)=>setPerCaller(Number(e.target.value))}/>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={autoRefill} onCheckedChange={setAutoRefill}/>
              <Label>Auto-refill on zero active leads</Label>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t pt-4">
          <Switch checked={phone10} onCheckedChange={setPhone10} />
          <div>
            <Label>Require 10-digit phone numbers on upload</Label>
            <p className="text-xs text-muted-foreground">When on, uploaded rows whose phone number does not have exactly 10 digits are rejected.</p>
          </div>
        </div>
        <Button onClick={()=>save.mutate()} disabled={save.isPending}>Save</Button>
      </Card>

      <Card className="p-5">
        <div className="font-semibold mb-3">Lead Statuses</div>
        <div className="flex flex-wrap gap-2">
          {statuses?.map((s)=> (
            <span key={s.id} className={`text-xs px-2 py-1 rounded border ${s.is_completion ? "bg-success/10 border-success/30 text-success" : "bg-muted"}`}>
              {s.name}{s.is_completion ? " ?" : ""}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">Completion statuses remove the lead from the active quota.</p>
      </Card>

      <Card className="p-5">
        <div className="font-semibold mb-3">Lead Temperatures</div>
        <div className="flex flex-wrap gap-2">
          {temps?.map((t)=>(<span key={t.id} className="text-xs px-2 py-1 rounded border bg-muted">{t.name}</span>))}
        </div>
      </Card>
    </div>
  );
}