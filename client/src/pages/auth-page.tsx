import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Redirect } from "wouter";
import { z } from "zod";
import { insertUserSchema } from "@shared/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const loginSchema = insertUserSchema.pick({ username: true, password: true });

const verifyEmailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  otp: z.string().length(6, "Verification code must be 6 digits")
});

const resetPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  otp: z.string().length(6, "Reset code must be 6 digits"),
  newPassword: z.string().min(6, "Password must be at least 6 characters")
});

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("login");
  const [verifyingOTP, setVerifyingOTP] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [verificationMode, setVerificationMode] = useState<'email' | 'password'>('email');

  const loginForm = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const registerForm = useForm({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      university: "",
      gender: "",
    },
  });

  const verifyEmailForm = useForm({
    resolver: zodResolver(verifyEmailSchema),
    defaultValues: {
      email: "",
      otp: "",
    },
  });

  const resetPasswordForm = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      email: "",
      otp: "",
      newPassword: "",
    },
  });

  if (user) {
    return <Redirect to="/" />;
  }

  const onRegister = async (data: z.infer<typeof insertUserSchema>) => {
    try {
      const response = await apiRequest("POST", "/api/register", data);
      const result = await response.json();
      verifyEmailForm.setValue('email', data.email);
      setVerificationMode('email');
      setActiveTab("verify");
      toast({
        title: "Registration successful",
        description: result.message,
      });
    } catch (error) {
      toast({
        title: "Registration failed",
        description: error instanceof Error ? error.message : "Failed to register",
        variant: "destructive",
      });
    }
  };

  const onVerifyEmail = async (data: z.infer<typeof verifyEmailSchema>) => {
    try {
      setVerifyingOTP(true);
      const response = await apiRequest("POST", "/api/verify-email", data);
      const result = await response.json();
      toast({
        title: "Email verified",
        description: result.message,
      });
      setActiveTab("login");
    } catch (error) {
      toast({
        title: "Verification failed",
        description: error instanceof Error ? error.message : "Failed to verify email",
        variant: "destructive",
      });
    } finally {
      setVerifyingOTP(false);
    }
  };

  const onForgotPassword = async (data: z.infer<typeof verifyEmailSchema>) => {
    try {
      setIsResettingPassword(true);
      const response = await apiRequest("POST", "/api/forgot-password", { email: data.email });
      const result = await response.json();
      resetPasswordForm.setValue('email', data.email);
      toast({
        title: "Reset code sent",
        description: result.message,
      });
      setVerificationMode('password');
      setActiveTab("verify");
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send reset code",
        variant: "destructive",
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const onResetPassword = async (data: z.infer<typeof resetPasswordSchema>) => {
    try {
      setIsResettingPassword(true);
      const response = await apiRequest("POST", "/api/reset-password", data);
      const result = await response.json();
      toast({
        title: "Password reset successful",
        description: result.message,
      });
      setActiveTab("login");
    } catch (error) {
      toast({
        title: "Reset failed",
        description: error instanceof Error ? error.message : "Failed to reset password",
        variant: "destructive",
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-6">
        <Card className="w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">UniCommute</CardTitle>
            <CardDescription>
              Connect with fellow students for convenient carpooling
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
                <TabsTrigger value="verify">Verify</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <Form {...loginForm}>
                  <form
                    onSubmit={loginForm.handleSubmit((data) =>
                      loginMutation.mutate(data)
                    )}
                    className="space-y-4 mt-4"
                  >
                    <FormField
                      control={loginForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter username" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="Enter password"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      className="w-full mt-6"
                      disabled={loginMutation.isPending}
                    >
                      {loginMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Login
                    </Button>

                    <div className="text-center mt-4">
                      <button
                        type="button"
                        className="text-sm text-primary hover:underline"
                        onClick={() => {
                          setVerificationMode('password');
                          setActiveTab("verify");
                        }}
                      >
                        Forgot password?
                      </button>
                    </div>
                  </form>
                </Form>
              </TabsContent>

              <TabsContent value="register">
                <Form {...registerForm}>
                  <form
                    onSubmit={registerForm.handleSubmit(onRegister)}
                    className="space-y-4 mt-4"
                  >
                    <div className="space-y-4">
                      <FormField
                        control={registerForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Username</FormLabel>
                            <FormControl>
                              <Input placeholder="Choose username" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={registerForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input
                                type="email"
                                placeholder="Enter your BRAC University email"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                            <p className="text-xs text-muted-foreground">
                              Only @g.bracu.ac.bd or @bracu.ac.bd email addresses are allowed
                            </p>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={registerForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="Choose password"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        control={registerForm.control}
                        name="university"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>University</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter university name"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={registerForm.control}
                        name="gender"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Gender</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select gender" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="male">Male</SelectItem>
                                <SelectItem value="female">Female</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full mt-6"
                      disabled={registerMutation.isPending}
                    >
                      {registerMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Register
                    </Button>
                  </form>
                </Form>
              </TabsContent>

              <TabsContent value="verify">
                {verificationMode === 'email' ? (
                  <Form {...verifyEmailForm}>
                    <form
                      onSubmit={verifyEmailForm.handleSubmit(onVerifyEmail)}
                      className="space-y-4 mt-4"
                    >
                      <Alert>
                        <AlertDescription>
                          Please check your email for the verification code.
                        </AlertDescription>
                      </Alert>

                      <FormField
                        control={verifyEmailForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input
                                type="email"
                                placeholder="Enter your email"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={verifyEmailForm.control}
                        name="otp"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Verification Code</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter 6-digit code"
                                maxLength={6}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button
                        type="submit"
                        className="w-full"
                        disabled={verifyingOTP}
                      >
                        {verifyingOTP && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Verify Email
                      </Button>
                    </form>
                  </Form>
                ) : (
                  <Form {...resetPasswordForm}>
                    <form
                      onSubmit={resetPasswordForm.handleSubmit(onResetPassword)}
                      className="space-y-4 mt-4"
                    >
                      <FormField
                        control={resetPasswordForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input
                                type="email"
                                placeholder="Enter your registered email"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={resetPasswordForm.control}
                        name="otp"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Reset Code</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter 6-digit code"
                                maxLength={6}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={resetPasswordForm.control}
                        name="newPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>New Password</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="Enter new password"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button
                        type="submit"
                        className="w-full"
                        disabled={isResettingPassword}
                      >
                        {isResettingPassword && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Reset Password
                      </Button>
                    </form>
                  </Form>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card className="hidden md:block">
          <CardContent className="p-6">
            <img
              src="https://cdn.dribbble.com/users/1787323/screenshots/7123758/media/3f57d666645e5d60893b9afde9577e3c.png"
              alt="Carpooling Illustration"
              className="w-full rounded-lg"
            />
            <div className="mt-6 space-y-4">
              <h3 className="text-xl font-semibold">Why UniCommute?</h3>
              <ul className="space-y-2">
                <li>✓ Connect with fellow students</li>
                <li>✓ Save money on transportation</li>
                <li>✓ Reduce your carbon footprint</li>
                <li>✓ Make new friends</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}