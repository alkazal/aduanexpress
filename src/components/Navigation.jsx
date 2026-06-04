import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

import HomeIcon from "@heroicons/react/24/outline/HomeIcon";
import ClipboardDocumentListIcon from "@heroicons/react/24/outline/ClipboardDocumentListIcon";
import PlusCircleIcon from "@heroicons/react/24/outline/PlusCircleIcon";
import ArrowRightIcon from "@heroicons/react/24/outline/ArrowRightIcon"; 
import UserCircleIcon from "@heroicons/react/24/outline/UserCircleIcon";
import WrenchScrewdriverIcon from "@heroicons/react/24/outline/WrenchScrewdriverIcon";
import UsersIcon from "@heroicons/react/24/outline/UsersIcon";

export default function Navigation() {
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
    try {
      await supabase.auth.signOut({ scope: "global" });
    } finally {
      localStorage.removeItem("appUser");
      Object.keys(localStorage)
        .filter((k) => k.startsWith("sb-") && k.endsWith("-auth-token"))
        .forEach((k) => localStorage.removeItem(k));
      window.location.replace("/login");
    }
  };

  const linkClass = ({ isActive }) =>
  `px-3 py-2 rounded-lg transition ${
    isActive
      ? "bg-blue-100 text-blue-600 font-semibold"
      : "text-gray-600 hover:bg-gray-100"
  }`;

  const mobileLinkClass = ({ isActive }) =>
  `flex flex-col items-center transition ${
    isActive ? "text-blue-600" : "text-gray-600"
  }`;

  return (
    <>
    {/* SIDEBAR NAV (Desktop) */}
    <nav className="hidden md:flex flex-col w-64 h-screen bg-white shadow-lg fixed left-0 top-0 z-50">

      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-6 border-b">
        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
          <span className="text-white text-lg font-semibold">AE</span>
        </div>
        <span className="text-xl font-bold text-gray-800">AduanExpress</span>
      </div>

      {/* Navigation Links */}
      <div className="flex flex-col gap-4 px-6 py-6 text-lg">

        <NavLink to="/" className={linkClass}>Dashboard</NavLink>

        <NavLink to="/submissions" className={linkClass}>Reports</NavLink>

        {role === "manager" && (
          <NavLink to="/assign" className={linkClass}>Assign Reports</NavLink>
        )}

        {role === "manager" && (
          <NavLink to="/close-report" className={linkClass}>Close Reports</NavLink>
        )}

        {role === "manager" && (
          <NavLink to="/users" className={linkClass}>Users</NavLink>
        )}

        {role === "manager" && (
          <NavLink to="/projects" className={linkClass}>Projects</NavLink>
        )}

        {role === "technician" && (
          <NavLink to="/technician" className={linkClass}>Technician Board</NavLink>
        )}

        <NavLink to="/profile" className={linkClass}>Profile</NavLink>

        <NavLink to="/new-report" className={linkClass}>New Report</NavLink>

      </div>

      {/* Logout bottom */}
      <div className="mt-auto px-6 py-6 border-t">
        <button
          onClick={handleLogout}
          className="text-red-600 hover:text-red-700 font-medium flex items-center gap-2"
        >
          <ArrowRightIcon className="w-5 h-5" />
          Logout
        </button>
      </div>

    </nav>

      {/* BOTTOM TAB NAV (Mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white shadow-inner border-t border-border-light z-50">
        <div className="flex justify-around py-2">
          <NavLink to="/" className={mobileLinkClass}>
            <HomeIcon className="w-6 h-6" />
            <span className="text-xs">Home</span>
          </NavLink>

          <NavLink to="/submissions" className={mobileLinkClass}>
            <ClipboardDocumentListIcon className="w-6 h-6" />
            <span className="text-xs">Reports</span>
          </NavLink>

          {role === "technician" && (
            <NavLink to="/technician" className={mobileLinkClass}>
              <WrenchScrewdriverIcon className="w-6 h-6" />
                <span className="text-xs">Tasks</span>
            </NavLink>
          )}

          {role === "manager" && (
            <NavLink to="/assign" className={mobileLinkClass}>
              <WrenchScrewdriverIcon className="w-6 h-6" />
                <span className="text-xs">Assign</span>
            </NavLink>
          )}

          {role === "manager" && (
            <NavLink to="/users" className={mobileLinkClass}>
              <UsersIcon className="w-6 h-6" />
              <span className="text-xs">Users</span>
            </NavLink>
          )}

          {role === "manager" && (
            <NavLink to="/projects" className={mobileLinkClass}>
              <ClipboardDocumentListIcon className="w-6 h-6" />
              <span className="text-xs">Projects</span>
            </NavLink>
          )}

          <NavLink to="/profile" className={mobileLinkClass}>
            <UserCircleIcon className="w-6 h-6" />
            <span className="text-xs">Profile</span>
          </NavLink>

          <NavLink to="/new-report" className={mobileLinkClass}>
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
