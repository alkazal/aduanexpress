import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";

import ProtectedRoute from "./components/ProtectedRoute";
import PrivateRoute from "./components/PrivateRoute";
import SyncStatus from "./components/SyncStatus";
import { initAutoSync } from "./lib/syncAuto";

import { AppSidebar } from "@/components/app-sidebar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Home = lazy(() => import("./pages/Home"));
const NewReport = lazy(() => import("./pages/NewReport"));
const MySubmissions = lazy(() => import("./pages/MySubmissions"));
const ReportDetails = lazy(() => import("./pages/ReportDetails"));
const EditReport = lazy(() => import("./pages/EditReport"));
const AssignReport = lazy(() => import("./pages/AssignReport"));
const TechnicianDashboard = lazy(() => import("./pages/TechnicianDashboard"));
const CloseReport = lazy(() => import("./pages/ManagerCloseReport"));
const EditProfile = lazy(() => import("./pages/EditProfile"));
const UsersList = lazy(() => import("./pages/UsersList"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const Projects = lazy(() => import("./pages/Projects"));
const TestSession = lazy(() => import("./TestSession"));

function RouteFallback() {
  return (
    <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
      Loading...
    </div>
  );
}

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/test" element={<TestSession />} />
        <Route path="/report/:id" element={<ReportDetails />} />
        <Route path="/report/:id/edit" element={<EditReport />} />

        {/* Protected routes */}
        <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/new-report" element={<ProtectedRoute><NewReport /></ProtectedRoute>} />
        <Route path="/submissions" element={<ProtectedRoute><MySubmissions /></ProtectedRoute>} />
        <Route path="/assign" element={<PrivateRoute role="manager"><AssignReport /></PrivateRoute>} />
        <Route path="/close-report" element={<PrivateRoute role="manager"><CloseReport /></PrivateRoute>} />
        <Route path="/users" element={<PrivateRoute role="manager"><UsersList /></PrivateRoute>} />
        <Route path="/users/:id" element={<PrivateRoute role="manager"><UserProfile /></PrivateRoute>} />
        <Route path="/projects" element={<PrivateRoute role="manager"><Projects /></PrivateRoute>} />
        <Route path="/technician" element={<PrivateRoute role="technician"><TechnicianDashboard /></PrivateRoute>} />
        <Route path="/profile" element={<ProtectedRoute requireProfileComplete={false}><EditProfile /></ProtectedRoute>} />
      </Routes>
    </Suspense>
  );
}

function AppContent() {
  const location = useLocation();
  const isPublic = PUBLIC_PATHS.includes(location.pathname);

  useEffect(() => {
    initAutoSync();
  }, []);

  if (isPublic) {
    return (
      <>
        <AppRoutes />
        <SyncStatus />
      </>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/">AduanExpress</BreadcrumbLink>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col p-4 pt-4">
          <AppRoutes />
        </div>
      </SidebarInset>
      <SyncStatus />
    </SidebarProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
