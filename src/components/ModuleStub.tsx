import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

export function ModuleStub({
  title,
  subtitle,
  features,
}: {
  title: string;
  subtitle: string;
  features: string[];
}) {
  return (
    <>
      <Topbar title={title} subtitle={subtitle} />
      <div className="p-6">
        <Card>
          <CardContent className="p-10 text-center max-w-2xl mx-auto">
            <div className="size-14 mx-auto rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
              <Construction className="size-7" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight">Module ready for build-out</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Auth, RBAC and module-level access are already wired. Build this module
              with the patterns from the Production module.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2 text-left">
              {features.map((f) => (
                <div key={f} className="text-sm rounded-md border bg-muted/40 px-3 py-2">
                  {f}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
