/**
 * Layout for every Settings route. Navigation lives in the app sidebar (which switches to the Settings menu on these
 * routes), so this is just a white surface with a content column that uses the width.
 */
export function SettingsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-white px-4 pb-12 pt-6 sm:px-8 lg:px-10 lg:pt-8">
      <div className="mx-auto max-w-[1040px]">{children}</div>
    </div>
  );
}
