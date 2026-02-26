import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

import HomeIcon from "@heroicons/react/24/outline/HomeIcon";
import ClipboardDocumentListIcon from "@heroicons/react/24/outline/ClipboardDocumentListIcon";
import PlusCircleIcon from "@heroicons/react/24/outline/PlusCircleIcon";
import ArrowRightIcon from "@heroicons/react/24/outline/ArrowRightIcon"; 

export default function Navigation() {
  const navigate = useNavigate();
  const [role, setRole] = useState(null);
  
  useEffect(() => {
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      console.log("INITIAL SESSION:", session);

      if (session) {
        loadRole(session.user.id);
      }
    };

    const loadRole = async (userId) => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", userId)
        .single();

      console.log("ROLE FROM DB:", data, error);

      if (data?.role) {
        setRole(data.role);
      }
    };

    // 1. Load initial session
    getInitialSession();

    // 2. Listen for future login/logout changes
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        console.log("AUTH EVENT:", _event, session);

        if (session?.user) {
          loadRole(session.user.id);
        } else {
          setRole(null);
        }
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);


  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("appUser");
    window.location.href = "/login";
  };

  const linkClass = ({ isActive }) =>
    isActive
      ? "text-blue-600 font-semibold"
      : "text-gray-600";

  return (
    <>
      {/* TOP NAV (Desktop) */}
      <nav className="hidden md:flex items-center justify-between bg-white shadow px-6 py-3 sticky top-0 z-50">
        <div className="flex space-x-6 text-lg">
          <NavLink to="/" className={linkClass}>Dashboard</NavLink>
          <NavLink to="/submissions" className={linkClass}>Reports</NavLink>     
          
          {role === "manager" && (
            <NavLink to="/assign" className={linkClass}>
              Assign Reports
            </NavLink>
          )}

          {role === "manager" && (
            <NavLink to="/close-report" className={linkClass}>
              Close Reports
            </NavLink>
          )}

          {role === "technician" && (
            <NavLink to="/technician" className={linkClass}>
              Technician Board
            </NavLink>
          )}

          <NavLink to="/profile" className={linkClass}>Profile</NavLink>

          <NavLink to="/new-report" className={linkClass}>New Report</NavLink>

          


        </div>

        <button
          onClick={handleLogout}
          className="text-red-600 hover:text-red-700 font-medium flex items-center space-x-2"
        >
          <ArrowRightIcon  className="w-5 h-5" />
          <span>Logout</span>
        </button>
      </nav>

      {/* BOTTOM TAB NAV (Mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white shadow-inner border-t z-50">
        <div className="flex justify-around py-2">
          <NavLink to="/" className="flex flex-col items-center">
            <HomeIcon className="w-6 h-6" />
            <span className="text-xs">Home</span>
          </NavLink>

          <NavLink to="/submissions" className="flex flex-col items-center">
            <ClipboardDocumentListIcon className="w-6 h-6" />
            <span className="text-xs">Reports</span>
          </NavLink>

          {role === "technician" && (
            <NavLink to="/technician" className="flex flex-col items-center">
              <ClipboardDocumentListIcon className="w-6 h-6" />
                <span className="text-xs">Tasks</span>
            </NavLink>
          )}

          {role === "manager" && (
            <NavLink to="/assign" className="flex flex-col items-center">
              <ClipboardDocumentListIcon className="w-6 h-6" />
                <span className="text-xs">Assign</span>
            </NavLink>
          )}

          <NavLink to="/profile" className="flex flex-col items-center">
            <ClipboardDocumentListIcon className="w-6 h-6" />
            <span className="text-xs">Profile</span>
          </NavLink>

          <NavLink to="/new-report" className="flex flex-col items-center">
            <PlusCircleIcon className="w-6 h-6" />
            <span className="text-xs">New</span>
          </NavLink>

          <button onClick={handleLogout} className="flex flex-col items-center text-red-600">
            <ArrowRightIcon  className="w-6 h-6" />
            <span className="text-xs">Logout</span>
          </button>

        </div>
      </nav>
    </>
  );
}
