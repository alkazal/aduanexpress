import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";

import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";

import Home from "./pages/Home";
import NewReport from "./pages/NewReport";
import MySubmissions from "./pages/MySubmissions";
import ReportDetails from "./pages/ReportDetails";
import EditReport from "./pages/EditReport";
import AssignReport from "./pages/AssignReport";
import TechnicianDashboard from "./pages/TechnicianDashboard";
import CloseReport from "./pages/ManagerCloseReport";
import EditProfile from "./pages/EditProfile";
import UsersList from "./pages/UsersList";
import UserProfile from "./pages/UserProfile";
import Projects from "./pages/Projects";

import TestSession from "./TestSession";
import ProtectedRoute from "./components/ProtectedRoute";
import PrivateRoute from "./components/PrivateRoute";
import SyncStatus from "./components/SyncStatus";
import { initAutoSync } from "./lib/syncAuto";

import { AppSidebar } from "@/components/app-sidebar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

function AppRoutes() {
  return (
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
