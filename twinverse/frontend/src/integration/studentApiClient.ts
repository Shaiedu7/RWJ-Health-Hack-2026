import type { EncounterMode, MutationContext } from "./contracts.ts"
import { parseEncounter, parseFeedback, parsePatients } from "./validation.ts"

export class StudentApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = "StudentApiError"
    this.status = status
    this.code = code
  }
}
export interface StudentApiOptions {
  baseUrl: string
  fetch?: typeof globalThis.fetch
  getAccessToken?: () => Promise<string | null>
  /** Required by the backend for cookie-authenticated mutations. */
  getCsrfToken?: () => Promise<string | null>
  timeoutMs?: number
}
export function createStudentApiClient(options: StudentApiOptions) {
  const base = options.baseUrl.replace(/\/$/, "")
  if (
    !base ||
    (!/^https?:\/\//.test(base) &&
      (!base.startsWith("/") || base.startsWith("//")))
  )
    throw new Error("Configure an API URL or same-origin /api path.")
  const send = options.fetch ?? globalThis.fetch
  const segment = (id: string) => {
    if (!id.trim()) throw new Error("ID is required.")
    return encodeURIComponent(id)
  }
  async function request(path: string, body?: unknown) {
    const token = await options.getAccessToken?.()
    const csrf = body === undefined ? null : await options.getCsrfToken?.()
    const headers: Record<string, string> = { Accept: "application/json" }
    if (token) headers.Authorization = `Bearer ${token}`
    if (body !== undefined) headers["Content-Type"] = "application/json"
    if (csrf) headers["X-CSRF-Token"] = csrf
    const controller = new AbortController()
    const timer = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? 15000,
    )
    try {
      const response = await send(`${base}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers,
        credentials: "include",
        signal: controller.signal,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      if (!response.ok) {
        const messages: Record<number, string> = {
          401: "Sign in to continue.",
          403: "You do not have access to this encounter.",
          404: "Patient or encounter is unavailable.",
          409: "The encounter changed. Reload before the next action.",
          422: "This patient is not ready for an approved encounter.",
          429: "Please wait before trying again.",
        }
        throw new StudentApiError(
          response.status,
          `HTTP_${response.status}`,
          messages[response.status] ??
            "The backend could not complete this request.",
        )
      }
      return (await response.json()) as unknown
    } catch (error) {
      if (error instanceof StudentApiError) throw error
      if (error instanceof Error && error.name === "AbortError")
        throw new StudentApiError(
          0,
          "TIMEOUT",
          "Request timed out. Reload or retry with the same request ID.",
        )
      throw new StudentApiError(
        0,
        "NETWORK_ERROR",
        "Cannot reach the backend. No demo response was substituted.",
      )
    } finally {
      clearTimeout(timer)
    }
  }
  function mutation(context: MutationContext) {
    if (
      !context.requestId.trim() ||
      !Number.isSafeInteger(context.expectedRevision) ||
      context.expectedRevision < 0
    )
      throw new Error(
        "Stable request ID and current encounter revision are required.",
      )
    return {
      requestId: context.requestId,
      expectedRevision: context.expectedRevision,
    }
  }
  async function snapshot(path: string, body?: unknown, encounterId?: string) {
    const result = parseEncounter(await request(path, body))
    if (encounterId && result.encounterId !== encounterId)
      throw new StudentApiError(
        0,
        "WRONG_ENCOUNTER",
        "Backend returned a different encounter.",
      )
    return result
  }
  return {
    async listPatients(cursor?: string) {
      return parsePatients(
        await request(
          `/patients${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        ),
      )
    },
    async start(
      patientId: string,
      requestId: string,
      mode: EncounterMode = "approved",
    ) {
      if (!requestId.trim())
        throw new Error("A stable start request ID is required.")
      const result = await snapshot("/encounters", {
        patientId,
        requestId,
        mode,
      })
      if (result.patientId !== patientId || result.mode !== mode)
        throw new StudentApiError(
          0,
          "WRONG_PATIENT_OR_MODE",
          "Backend returned a different patient or encounter mode.",
        )
      return result
    },
    async restore(encounterId: string) {
      return snapshot(
        `/encounters/${segment(encounterId)}`,
        undefined,
        encounterId,
      )
    },
    async sendMessage(
      encounterId: string,
      text: string,
      context: MutationContext,
    ) {
      if (!text.trim()) throw new Error("Message cannot be empty.")
      return snapshot(
        `/encounters/${segment(encounterId)}/messages`,
        { ...mutation(context), text: text.trim() },
        encounterId,
      )
    },
    async requestRecord(
      encounterId: string,
      recordKind: "labs" | "notes" | "imaging",
      context: MutationContext,
    ) {
      return snapshot(
        `/encounters/${segment(encounterId)}/record-requests`,
        { ...mutation(context), recordKind },
        encounterId,
      )
    },
    async recordOpened(
      encounterId: string,
      recordId: string,
      context: MutationContext,
    ) {
      return snapshot(
        `/encounters/${segment(encounterId)}/record-openings`,
        { ...mutation(context), recordId },
        encounterId,
      )
    },
    async finish(encounterId: string, context: MutationContext) {
      return snapshot(
        `/encounters/${segment(encounterId)}/finish`,
        mutation(context),
        encounterId,
      )
    },
    async feedback(encounterId: string) {
      const result = parseFeedback(
        await request(`/encounters/${segment(encounterId)}/feedback`),
      )
      if (
        result.status === "ready" &&
        result.feedback.encounterId !== encounterId
      )
        throw new StudentApiError(
          0,
          "WRONG_ENCOUNTER",
          "Feedback belongs to a different encounter.",
        )
      return result
    },
  }
}
