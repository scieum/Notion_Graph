import { SetupForm } from "@/components/SetupForm";

export default function Page() {
  return (
    <main className="flex min-h-screen flex-col bg-[#f6f5f4] px-6 py-12">
      <div className="flex-1">
        <SetupForm />
      </div>
      <footer className="mx-auto mt-12 flex max-w-6xl items-center justify-center gap-2.5 text-sm text-[#a39e98]">
        <span>
          © 2026 <span className="font-semibold text-[#615d59]">NotionTalk</span>. All
          rights reserved.
        </span>
        <a
          href="https://open.kakao.com/o/gpSvPKGg"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="카카오톡 오픈채팅"
          title="카카오톡 오픈채팅"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#FEE500] transition-opacity hover:opacity-85"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#3C1E1E" aria-hidden>
            <path d="M12 3.5C6.75 3.5 2.5 6.86 2.5 11c0 2.66 1.77 4.99 4.43 6.32-.18.64-.66 2.4-.76 2.77-.12.46.17.46.36.33.15-.1 2.35-1.59 3.31-2.24.55.08 1.1.12 1.66.12 5.25 0 9.5-3.36 9.5-7.5S17.25 3.5 12 3.5z" />
          </svg>
        </a>
      </footer>
    </main>
  );
}
