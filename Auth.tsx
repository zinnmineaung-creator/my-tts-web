import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useVipLogin, useFreeEntry } from "@workspace/api-client-react";
import { useAuthToken } from "@/lib/auth";
import { getDeviceFingerprint } from "@/lib/fingerprint";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { HeadphonesIcon, KeyRoundIcon, UnlockIcon } from "lucide-react";

const vipSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit VIP password"),
});

export function Auth() {
  const { saveToken } = useAuthToken();
  const { toast } = useToast();

  const vipLoginMutation = useVipLogin({
    mutation: {
      onSuccess: (data) => {
        saveToken(data.token);
        toast({
          title: "VIP unlocked",
          description: "Welcome back, VIP member!",
        });
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Unable to unlock VIP access",
          description: error.data?.error || "Invalid or expired VIP password",
        });
      },
    },
  });

  const freeEntryMutation = useFreeEntry({
    mutation: {
      onSuccess: (data) => {
        saveToken(data.token);
        toast({
          title: "Free server unlocked",
          description: "Your 14-day free trial has started",
        });
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Unable to enter free server",
          description: error.data?.error || "Your free trial may have already expired",
        });
      },
    },
  });

  const vipForm = useForm<z.infer<typeof vipSchema>>({
    resolver: zodResolver(vipSchema),
    defaultValues: { code: "" },
  });

  const onVipSubmit = (data: z.infer<typeof vipSchema>) => {
    vipLoginMutation.mutate({ data: { code: data.code } });
  };

  const onFreeEntry = () => {
    freeEntryMutation.mutate({ data: { fingerprint: getDeviceFingerprint() } });
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-primary">
          <HeadphonesIcon className="w-8 h-8" />
        </div>
        <h2 className="text-3xl font-bold tracking-tight mb-2 text-foreground">Studio Access</h2>
        <p className="text-muted-foreground">Sign in to generate high-quality Myanmar speech</p>
      </div>

      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRoundIcon className="w-5 h-5 text-primary" />
            VIP Access
          </CardTitle>
          <CardDescription>
            Get your unique 6-digit password from the @zinn_tts_srt_bot Telegram bot
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...vipForm}>
            <form onSubmit={vipForm.handleSubmit(onVipSubmit)} className="space-y-4">
              <FormField
                control={vipForm.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Enter Your 6-Digit VIP Password
                      <span className="block text-sm font-normal text-muted-foreground mt-0.5">
                        မင်းရဲ့ VIP Password ၆ လုံးကို ရိုက်ထည့်ပါ
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="123456"
                        inputMode="numeric"
                        maxLength={6}
                        className="text-center text-lg tracking-[0.5em]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={vipLoginMutation.isPending}>
                {vipLoginMutation.isPending ? <Spinner className="mr-2" /> : null}
                Unlock / Sign In
              </Button>
            </form>
          </Form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/50" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={onFreeEntry}
            disabled={freeEntryMutation.isPending}
          >
            {freeEntryMutation.isPending ? (
              <Spinner className="mr-2" />
            ) : (
              <UnlockIcon className="w-4 h-4 mr-2" />
            )}
            Enter Free Server (No Password Required)
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Starts your 14-day free trial automatically
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
