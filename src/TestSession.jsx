import { supabase } from "./lib/supabase";

export default function TestSession() {
  const check = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    console.log("SESSION:", session);
    alert(session ? "Session exists" : "No session");
  };

  return (
    <button onClick={check} className="p-3 bg-green-600 text-white">
      Check Session
    </button>
  );
}
