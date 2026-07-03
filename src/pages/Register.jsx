import { useState } from "react";

import { useNavigate } from "react-router-dom";
import { SignupForm } from "./SignupForm";

export default function Register() {
  // const [email, setEmail] = useState("");
  // const [password, setPassword] = useState("");
  // const [confirmPassword, setConfirmPassword] = useState("");
  // const [status, setStatus] = useState("");
  // const [statusType, setStatusType] = useState("error");

  // const navigate = useNavigate();

  // const handleRegister = async () => {
  //   setStatus("");
  //   setStatusType("error");

  //   if (!email || !password) {
  //     setStatus("Please fill in all fields");
  //     setStatusType("error");
  //     return;
  //   }

  //   if (password !== confirmPassword) {
  //     setStatus("Passwords do not match");
  //     setStatusType("error");
  //     return;
  //   }

  //   const { error } = await supabase.auth.signUp({
  //     email,
  //     password,
  //   });

  //   if (error) {
  //     setStatus(error.message);
  //     setStatusType("error");
  //     return;
  //   }

  //   setStatus("Registration successful! Please open your email to confirm your signup. Redirecting to login...");
  //   setStatusType("success");
  //   setTimeout(() => navigate("/login"), 4000);
  // };

  return (
    // <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-400 to-white px-4">
    //   <Card className="w-full max-w-md border-0 shadow-xl">
    //     <CardHeader>
    //       <div className="flex items-center justify-center gap-3 mb-2">
    //         <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
    //           <span className="text-white text-lg font-semibold">AE</span>
    //         </div>
    //         <h1 className="text-2xl font-bold">AduanExpress</h1>
    //       </div>
    //       <CardTitle className="text-center text-lg">Create Account</CardTitle>
    //     </CardHeader>
    //     <CardContent className="space-y-4">
    //       <div className="space-y-2">
    //         <Label htmlFor="register-email">Email</Label>
    //         <Input
    //           id="register-email"
    //           type="email"
    //           placeholder="you@example.com"
    //           value={email}
    //           onChange={(e) => setEmail(e.target.value)}
    //         />
    //       </div>

    //       <div className="space-y-2">
    //         <Label htmlFor="register-password">Password</Label>
    //         <Input
    //           id="register-password"
    //           type="password"
    //           placeholder="........"
    //           value={password}
    //           onChange={(e) => setPassword(e.target.value)}
    //         />
    //       </div>

    //       <div className="space-y-2">
    //         <Label htmlFor="register-confirm-password">Confirm Password</Label>
    //         <Input
    //           id="register-confirm-password"
    //           type="password"
    //           placeholder="........"
    //           value={confirmPassword}
    //           onChange={(e) => setConfirmPassword(e.target.value)}
    //         />
    //       </div>

    //       <Button onClick={handleRegister} className="w-full">
    //         Register
    //       </Button>

    //       {status && (
    //         <Alert className={statusType === "success" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}>
    //           <AlertDescription>{status}</AlertDescription>
    //         </Alert>
    //       )}

    //       <div className="text-center pt-2">
    //         <p className="text-sm text-gray-600">
    //           Already have an account?{" "}
    //           <Link to="/login" className="text-blue-600 hover:underline font-medium">
    //             Login here
    //           </Link>
    //         </p>
    //       </div>
    //     </CardContent>
    //   </Card>
    // </div>
     <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-5xl">
        <SignupForm />
      </div>
    </div>
  );
}

