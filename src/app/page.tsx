import { Header } from "@/components/layout/Header";
import { AnalysisPanel } from "@/components/analysis/AnalysisPanel";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export default function Home() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <Tabs defaultValue="listed" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="listed">상장사 분석</TabsTrigger>
            <TabsTrigger value="private">비상장사 분석</TabsTrigger>
          </TabsList>
          <TabsContent value="listed" className="mt-6">
            <AnalysisPanel tabType="listed" />
          </TabsContent>
          <TabsContent value="private" className="mt-6">
            <AnalysisPanel tabType="private" />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
