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
import { Button, buttonVariants } from "./ui/button";
import { Separator } from "./ui/separator";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";

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

  const desktopLinkClass = ({ isActive }) =>
    cn(
      buttonVariants({ variant: isActive ? "secondary" : "ghost", size: "sm" }),
      "h-auto justify-start px-3 py-2 text-left text-sm"
    );

  const mobileLinkClass = ({ isActive }) =>
    cn(
      buttonVariants({ variant: "ghost", size: "icon" }),
      "h-auto w-auto flex-col rounded-md px-2 py-1.5 text-[11px] leading-tight",
      isActive ? "text-blue-600" : "text-gray-600"
    );

  return (
    <>
    {/* SIDEBAR NAV (Desktop) */}
    <nav className="fixed left-0 top-0 z-50 hidden h-screen w-64 flex-col border-r border-gray-200 bg-white shadow-lg md:flex">

      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
          <span className="text-white text-lg font-semibold">AE</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xl font-bold text-gray-800">AduanExpress</span>
          {role && (
            <Badge variant="secondary" className="mt-1 w-fit capitalize">
              {role}
            </Badge>
          )}
        </div>
      </div>

      <Separator />

      {/* Navigation Links */}
      <div className="flex flex-col gap-2 px-4 py-4">

        <NavLink to="/" className={desktopLinkClass}>Dashboard</NavLink>

        <NavLink to="/submissions" className={desktopLinkClass}>Reports</NavLink>

        {role === "manager" && (
          <NavLink to="/assign" className={desktopLinkClass}>Assign Reports</NavLink>
        )}

        {role === "manager" && (
          <NavLink to="/close-report" className={desktopLinkClass}>Close Reports</NavLink>
        )}

        {role === "manager" && (
          <NavLink to="/users" className={desktopLinkClass}>Users</NavLink>
        )}

        {role === "manager" && (
          <NavLink to="/projects" className={desktopLinkClass}>Projects</NavLink>
        )}

        {role === "technician" && (
          <NavLink to="/technician" className={desktopLinkClass}>Technician Board</NavLink>
        )}

        <NavLink to="/profile" className={desktopLinkClass}>Profile</NavLink>

        <NavLink to="/new-report" className={desktopLinkClass}>New Report</NavLink>

      </div>

      {/* Logout bottom */}
      <div className="mt-auto px-4 py-4">
        <Separator className="mb-4" />
        <Button
          onClick={handleLogout}
          variant="ghost"
          className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <ArrowRightIcon className="w-5 h-5" />
          Logout
        </Button>
      </div>

    </nav>

      {/* BOTTOM TAB NAV (Mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white shadow-inner md:hidden">
        <div className="flex justify-around px-1 py-2">
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

          <Button
            onClick={handleLogout}
            variant="ghost"
            className="h-auto w-auto flex-col px-2 py-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <ArrowRightIcon  className="w-6 h-6" />
            <span className="text-xs">Logout</span>
          </Button>

        </div>
      </nav>
    </>
  );
}
