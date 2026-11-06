/** Skeleton shown while a page loads: static grey blocks, no spinner and no looping animation. */
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 rounded-control bg-[#e6e6e6]" />
      <div className="rounded-card bg-surface p-5">
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-5 rounded-control bg-[#eeeeee]" style={{ width: `${90 - i * 12}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
