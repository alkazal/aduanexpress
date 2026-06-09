import * as React from "react"
import {
  Home,
  FileText,
  PlusCircle,
  UserCircle,
  Users,
  FolderKanban,
  ClipboardCheck,
  ClipboardList,
  Wrench,
} from "lucide-react"


import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { supabase } from "@/lib/supabase"

function buildNav(role) {
  const nav = [
    { title: "Dashboard", url: "/", icon: Home },
    { title: "My Reports", url: "/submissions", icon: FileText },
    // { title: "New Report", url: "/new-report", icon: PlusCircle },
  ]

  if (role === "manager") {
    nav.push(
      { title: "Assign Reports", url: "/assign", icon: ClipboardList },
      { title: "Close Reports", url: "/close-report", icon: ClipboardCheck },
      { title: "Users", url: "/users", icon: Users },
      { title: "Projects", url: "/projects", icon: FolderKanban }
    )
  }

  if (role === "technician") {
    nav.push({ title: "Technician Board", url: "/technician", icon: Wrench })
  }

  //nav.push({ title: "Profile", url: "/profile", icon: UserCircle })

  return nav
}

export function AppSidebar(props) {
  const [user, setUser] = React.useState(null)
  const [role, setRole] = React.useState(null)

  React.useEffect(() => {
    const cached = localStorage.getItem("appUser")
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        setUser(parsed)
        setRole(parsed.role)
        return
      } catch (_) {}
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) return
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role, full_name")
        .eq("id", session.user.id)
        .single()
      setUser({ name: profile?.full_name || session.user.email, email: session.user.email, avatar: "" })
      setRole(profile?.role || "user")
    })
  }, [])

  const navItems = buildNav(role)
  const userData = user
    ? { name: user.full_name || user.name || user.email, email: user.email, avatar: user.avatar || "" }
    : { name: "Loading...", email: "", avatar: "" }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-0 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
            AE
          </div>
          <div className="grid flex-1 text-left text-lg leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate font-semibold">AduanExpress</span>
            {role && <span className="truncate text-xs text-muted-foreground capitalize">{role}</span>}
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={userData} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
