// Val, Sep 2026: business budget range and per-experience budget range
// both exist ("use both, business should be able to select what to
// work with") — an experience with its own budgetMin/budgetMax always
// wins (that's the owner explicitly overriding it for this one
// experience); an experience with neither set falls back to its
// business's budget range at read time, not at write time, so editing
// the business's default later doesn't require re-saving every
// experience that meant to inherit it.
//
// Also stamps `inheritedBudget` on the result so the dashboard's edit
// form can tell "this experience has no budget of its own, showing the
// business's" apart from "this experience explicitly set a budget that
// happens to equal the business's" — needed to default its own
// use-business-default checkbox correctly and to avoid accidentally
// turning an inherited value into a hard-coded one on save.
export function withBudgetFallback<
  E extends { budgetMin: number | null; budgetMax: number | null },
>(
  experience: E,
  business: { budgetMin: number | null; budgetMax: number | null } | null | undefined,
): E & { inheritedBudget: boolean } {
  if (experience.budgetMin != null || experience.budgetMax != null || !business) {
    return { ...experience, inheritedBudget: false };
  }
  return { ...experience, budgetMin: business.budgetMin, budgetMax: business.budgetMax, inheritedBudget: true };
}
