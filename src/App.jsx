import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
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

import TestSession from "./TestSession"
import ProtectedRoute from "./components/ProtectedRoute";
import PrivateRoute from "./components/PrivateRoute";

import SyncStatus from "./components/SyncStatus";
import { initAutoSync } from "./lib/syncAuto";
import { supabase } from "./lib/supabase";
import { urlBase64ToUint8Array } from "./lib/utils";
import Navigation from "./components/Navigation";

//import { usePushWorker } from "./lib/usePushWorker";

function AppContent() {
  const location = useLocation();
  const hideNavigation = location.pathname === "/login";

  //usePushWorker();

  useEffect(() => {
    initAutoSync();
}, []);


  return (
    <>
      {!hideNavigation && <Navigation />}

      <div className="pb-20 md:pb-0"> 

        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          {/* <Route path="/" element={<Home />} /> */}
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/test" element={<TestSession />} />
          <Route path="/report/:id" element={<ReportDetails />} />
          <Route path="/report/:id/edit" element={<EditReport />} />
          {/* Protected routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />
          <Route
            path="/new-report"
            element={
              <ProtectedRoute>
                <NewReport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/submissions"
            element={
              <ProtectedRoute>
                <MySubmissions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/assign"
            element={
              <PrivateRoute role="manager">
                <AssignReport />
              </PrivateRoute>           
            }
          />
          <Route
            path="/close-report"
            element={
              <PrivateRoute role="manager">
                <CloseReport/>
              </PrivateRoute>           
            }
          />
          <Route
            path="/technician"
            element={
              <PrivateRoute role="technician">
                <TechnicianDashboard />
              </PrivateRoute>
            }
          />
          {/* <Route
            path="/admin-reports"
            element={
              <PrivateRoute role={["manager", "admin"]}>
                <AdminReports />
              </PrivateRoute>
            }
          /> */}
        </Routes>

        
      </div>
      
      <SyncStatus />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
