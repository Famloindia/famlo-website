import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET() {
  const supabase = createAdminSupabaseClient();
  
  try {
    const { data, error } = await supabase
      .from("families")
      .select("state, city, village");
      
    if (error) throw error;
    
    const states = Array.from(new Set(data.filter(d => d.state).map(d => d.state)));
    const cities = Array.from(new Set(data.filter(d => d.city).map(d => d.city)));
    const villages = Array.from(new Set(data.filter(d => d.village).map(d => d.village)));
    
    return NextResponse.json({ states, cities, villages });
  } catch (error) {
    return NextResponse.json({ states: [], cities: [], villages: [] });
  }
}
