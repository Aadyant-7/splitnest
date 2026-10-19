export const categories = ['FOOD', 'GROCERIES', 'RENT', 'UTILITIES', 'TRAVEL', 'ENTERTAINMENT', 'SHOPPING', 'OTHER'] as const;
export type Category = typeof categories[number];
// Production responses preserve the API's decimal text; numbers also support small fixture values.
export type Money = string | number;
// Conservative compatibility bound: below this, binary-number error stays below half a paisa.
export const LEGACY_MONEY_LIMIT = 2 ** 45;
export interface User { id: string; email: string; displayName: string; createdAt: string }
export type Role = 'ADMIN' | 'MEMBER';
export interface GroupSummary { id: string; name: string; createdBy: string; createdAt: string; role: Role }
export interface Member { userId: string; email: string; displayName: string; role: Role; joinedAt: string }
export interface Group { id: string; name: string; createdBy: string; createdAt: string; members: Member[] }
export interface Expense {
  id: string; groupId: string; paidBy: string; amount: Money; description: string;
  category: Category; expenseDate: string; createdBy: string; importJobId: string | null;
  createdAt: string; splits: { userId: string; shareAmount: Money }[];
}
export interface ExpensePage {
  content: Expense[]; number: number; size: number; totalElements: number;
  totalPages: number; first: boolean; last: boolean;
}
export interface Balance {
  userId: string; displayName: string; currentMember: boolean;
  totalPaid: Money; totalShare: Money; netBalance: Money;
}
export interface ImportJob {
  id: string; status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  fileName: string; totalRows: number; importedRows: number; invalidRows: number;
  errorMessage: string | null; createdAt: string; startedAt: string | null; completedAt: string | null;
}
export interface Budget { id: string; groupId: string; category: Category; monthlyLimit: Money }
export interface BudgetAlert { id: string; category: Category; month: string; spent: Money; monthlyLimit: Money; createdAt: string }
export interface AccessResponse { accessToken: string; tokenType: string; expiresIn: number }
