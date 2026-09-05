import { clerkClient } from "@clerk/nextjs/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "@/lib/db/client"
import { getVerifiedUserEmails } from "@/lib/auth/verified-emails"

export type MyJudgeInvitation = { id: string; token: string; email: string; eventName: string; expiresAt: string }

export async function listMyJudgeInvitations(userId: string): Promise<MyJudgeInvitation[]> {
  const clerk = await clerkClient()
  const emails = getVerifiedUserEmails(await clerk.users.getUser(userId))
  if (!emails.length) return []
  const client = supabase() as unknown as SupabaseClient
  const { data,error } = await client.from("judge_invitations").select("id,token,email,expires_at,hackathon:hackathons!inner(name,status)").in("email",emails).eq("status","pending").gt("expires_at",new Date().toISOString()).order("created_at",{ ascending:false })
  if (error) throw new Error("We couldn't load your judging invitations.")
  return (data ?? []).flatMap((row) => {
    const event = (Array.isArray(row.hackathon) ? row.hackathon[0] : row.hackathon) as { name:string; status:string } | null
    return event && !["completed","archived"].includes(event.status) ? [{ id:row.id,token:row.token,email:row.email,eventName:event.name,expiresAt:row.expires_at }] : []
  })
}
