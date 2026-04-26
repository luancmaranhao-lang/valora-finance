import { useEffect, useState } from "react"
import { supabase } from "../services/supabaseClient"

function useSubscription() {
  const [plan, setPlan] = useState("free")
  const [isSubscriptionLoading, setIsSubscriptionLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      async function loadPlan() {
        try {
          setIsSubscriptionLoading(true)
          const {
            data: { user },
          } = await supabase.auth.getUser()

          if (!user?.id) {
            setPlan("free")
            return
          }

          const { data, error } = await supabase.from("profiles").select("plano").eq("id", user.id).maybeSingle()
          if (error) throw error
          setPlan((data?.plano ?? "free").toLowerCase())
        } catch {
          setPlan("free")
        } finally {
          setIsSubscriptionLoading(false)
        }
      }

      void loadPlan()
    }, 0)

    return () => clearTimeout(timer)
  }, [])

  return {
    plan,
    isPremium: plan === "premium",
    isSubscriptionLoading,
  }
}

export default useSubscription

