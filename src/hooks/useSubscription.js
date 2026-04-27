import { useEffect, useState } from "react"
import { supabase } from "../services/supabaseClient"

function useSubscription() {
  const [plan, setPlan] = useState("free")
  const [isSubscriptionLoading, setIsSubscriptionLoading] = useState(true)

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

      const { data, error } = await supabase
        .from("profiles")
        .select("plano, is_premium")
        .eq("id", user.id)
        .maybeSingle()

      if (error) throw error
      const isPremiumFlag = Boolean(data?.is_premium)
      const currentPlan = (data?.plano ?? "").toLowerCase()
      setPlan(isPremiumFlag ? "premium" : currentPlan || "free")
    } catch {
      setPlan("free")
    } finally {
      setIsSubscriptionLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadPlan()
    }, 0)

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadPlan()
    })

    return () => {
      clearTimeout(timer)
      subscription.unsubscribe()
    }
  }, [])

  return {
    plan,
    isPremium: plan === "premium",
    isSubscriptionLoading,
  }
}

export default useSubscription

