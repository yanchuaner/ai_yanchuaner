// 账户状态边界：会话、余额、流水、开发者 Key 与管理员额度。

import type { FormEvent, MutableRefObject } from "react";
import { useState } from "react";
import {
  createAccountKey,
  grantQuota,
  listAccountKeys,
  loadAccountBalance,
  loadAccountLedger,
  logout as logoutAccount,
  revokeAccountKey,
  type AccountApiKey,
  type AccountLedgerEntry,
  type AccountQuotaInput,
  type AccountSession,
} from "@/lib/account";
import { resolveActionError } from "@/lib/action-error-utils";

export type SessionState =
  | { status: "loading" }
  | { status: "anonymous"; message?: string }
  | {
      status: "authenticated";
      identity: AccountSession["identity"];
      subject: AccountSession["subject"];
      models: AccountSession["models"];
      sessionQuotaUnits: AccountSession["sessionQuotaUnits"];
      expiresAt: AccountSession["expiresAt"];
    };

type UseAccountStateOptions = {
  abortRef: MutableRefObject<AbortController | null>;
  onSessionExpired: () => void;
};

export function useAccountState({ abortRef, onSessionExpired }: UseAccountStateOptions) {
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const [balanceUnits, setBalanceUnits] = useState<number | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<AccountLedgerEntry[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerError, setLedgerError] = useState("");
  const [quotaForm, setQuotaForm] = useState({
    userId: "",
    action: "grant",
    amount: "",
    reason: "",
    reference: "",
  });
  const [quotaResult, setQuotaResult] = useState("");
  const [quotaError, setQuotaError] = useState("");
  const [keys, setKeys] = useState<AccountApiKey[]>([]);
  const [keyForm, setKeyForm] = useState({
    name: "",
    models: ["deepseek-v4-flash"],
    remainQuota: "100000",
    expiryDays: "30",
  });
  const [createdKey, setCreatedKey] = useState("");
  const [keysError, setKeysError] = useState("");

  function handleSessionExpired() {
    abortRef.current?.abort();
    setSession({ status: "anonymous" });
    onSessionExpired();
  }

  async function loadBalance() {
    try {
      const account = await loadAccountBalance();
      setBalanceUnits(account.balanceUnits);
    } catch (error) {
      resolveActionError(error, handleSessionExpired);
      setBalanceUnits(null);
    }
  }

  async function loadLedger() {
    try {
      const page = await loadAccountLedger();
      setLedgerEntries(page.entries);
      setLedgerTotal(page.total);
      setLedgerError("");
    } catch (error) {
      setLedgerEntries([]);
      setLedgerTotal(0);
      const message = resolveActionError(error, handleSessionExpired);
      if (message) setLedgerError(message);
    }
  }

  async function loadKeys() {
    try {
      setKeys(await listAccountKeys());
      setKeysError("");
    } catch (error) {
      setKeys([]);
      const message = resolveActionError(error, handleSessionExpired);
      if (message) setKeysError(message);
    }
  }

  async function submitKey(event: FormEvent) {
    event.preventDefault();
    setKeysError("");
    setCreatedKey("");
    try {
      const result = await createAccountKey({
        name: keyForm.name,
        models: keyForm.models,
        remainQuota: Number(keyForm.remainQuota),
        expiryDays: Number(keyForm.expiryDays),
      });
      setCreatedKey(result.key);
      setKeyForm({ name: "", models: ["deepseek-v4-flash"], remainQuota: "100000", expiryDays: "30" });
      await loadKeys();
    } catch (error) {
      const message = resolveActionError(error, handleSessionExpired);
      if (message) setKeysError(message);
    }
  }

  async function deleteKey(id: number) {
    if (!window.confirm("删除该 Key？使用它的请求将立即失效。")) return;
    try {
      await revokeAccountKey(id);
      await loadKeys();
    } catch (error) {
      const message = resolveActionError(error, handleSessionExpired);
      if (message) setKeysError(message);
    }
  }

  async function submitQuota(event: FormEvent) {
    event.preventDefault();
    setQuotaResult("");
    setQuotaError("");
    try {
      const result = await grantQuota({
        userId: Number(quotaForm.userId),
        action: quotaForm.action as AccountQuotaInput["action"],
        amount: Number(quotaForm.amount),
        reason: quotaForm.reason,
        reference: quotaForm.reference,
      });
      setQuotaResult(`发放成功，最新余额 ${result.balanceAfter}`);
      setQuotaForm((current) => ({ ...current, userId: "", amount: "", reference: "" }));
      void loadBalance();
    } catch (error) {
      const message = resolveActionError(error, handleSessionExpired);
      if (message) setQuotaError(message);
    }
  }

  async function logout() {
    try {
      await logoutAccount();
    } catch {
      // 退出请求失败时也重置本地会话，避免页面停留在已退出状态。
    }
    setSession({ status: "anonymous" });
    onSessionExpired();
  }

  return {
    session,
    setSession,
    handleSessionExpired,
    loadBalance,
    loadLedger,
    loadKeys,
    submitKey,
    deleteKey,
    submitQuota,
    logout,
    balanceUnits,
    ledgerEntries,
    ledgerTotal,
    ledgerError,
    quotaForm,
    setQuotaForm,
    quotaResult,
    quotaError,
    keys,
    keyForm,
    setKeyForm,
    createdKey,
    keysError,
  };
}
