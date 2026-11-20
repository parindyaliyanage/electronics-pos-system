/**
 * Opens or downloads a PDF that needs the login token (so it can't be a
 * plain link). For "open", the tab is created synchronously, while the click
 * still counts as a user action; otherwise pop-up blockers stop it.
 */
export async function showPdf(fetchPdf: () => Promise<Blob>, fileName: string, mode: "open" | "download") {
  const tab = mode === "open" ? window.open("", "_blank") : null;
  try {
    const url = URL.createObjectURL(await fetchPdf());
    if (tab) {
      tab.location.href = url;
    } else {
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}

const dateTime = new Intl.DateTimeFormat("en-LK", { dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("en-LK", { dateStyle: "medium" });

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatDate = (iso: string) => dateOnly.format(new Date(iso));
/** A DATE column ("2026-12-20T00:00:00.000Z") shown as its calendar date, without a time-zone shift. */
export const formatDueDate = (iso: string) => dateOnly.format(new Date(`${iso.slice(0, 10)}T12:00:00`));
