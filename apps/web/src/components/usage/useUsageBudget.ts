import { useLocalStorage } from "../../hooks/useLocalStorage";
import {
  DAILY_USAGE_BUDGET_STORAGE_KEY,
  USAGE_BUDGET_STORAGE_KEY,
  UsageBudgetSchema,
  type UsageBudgetPeriod,
} from "./usageBudgetUtils";

export function useUsageBudget(period: UsageBudgetPeriod = "month") {
  return useLocalStorage(
    period === "day" ? DAILY_USAGE_BUDGET_STORAGE_KEY : USAGE_BUDGET_STORAGE_KEY,
    null,
    UsageBudgetSchema,
  );
}
