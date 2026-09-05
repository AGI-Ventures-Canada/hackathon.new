import {afterEach,beforeEach,describe,expect,it,mock} from "bun:test"
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react"
import {resetComponentMocks} from "@/__tests__/lib/component-mocks"
import {CoreCriteriaEditor} from "@/components/hackathon/judging/core-criteria-editor"
import {EditPrizeDialog,type EditablePrize} from "@/components/hackathon/judging/edit-prize-dialog"
const originalFetch = globalThis.fetch
const criterion = {id:"33333333-3333-4333-8333-333333333333",name:"Original question",description:null,weight:100,minScore:0,maxScore:10,displayOrder:0}
beforeEach(() => {cleanup();localStorage.clear();resetComponentMocks()})
afterEach(() => {cleanup();globalThis.fetch=originalFetch})
describe("scorecard editing recovery", () => {
  it("restores the active custom question and its original ID after changing setup steps",async () => {
    const first=render(<CoreCriteriaEditor hackathonId="event-recovery" criteria={[criterion]} />)
    fireEvent.click(screen.getByRole("button",{name:"Edit criterion"}))
    fireEvent.change(screen.getByRole("textbox",{name:"Question name"}),{target:{value:"Clear custom question"}})
    first.unmount()
    render(<CoreCriteriaEditor hackathonId="event-recovery" criteria={[criterion]} />)
    expect((screen.getByRole("textbox",{name:"Question name"}) as HTMLInputElement).value).toBe("Clear custom question")
    let finish!: (response:Response) => void
    globalThis.fetch=mock(() => new Promise<Response>((resolve) => {finish=resolve})) as typeof fetch
    fireEvent.click(screen.getByRole("button",{name:"Save"}))
    expect(screen.getByText("Clear custom question")).toBeDefined()
    expect(screen.queryByRole("textbox",{name:"Question name"})).toBeNull()
    expect(globalThis.fetch).toHaveBeenCalledWith(`/api/dashboard/hackathons/event-recovery/core-criteria/${criterion.id}`,expect.objectContaining({method:"PATCH"}))
    finish(new Response(JSON.stringify({error:"Try again"}),{status:503}))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Try again"))
    expect((screen.getByRole("textbox",{name:"Question name"}) as HTMLInputElement).value).toBe("Clear custom question")
  })
  it("keeps an edited prize's scorecard IDs through dialog unmount and recovery",async () => {
    const prize:EditablePrize={id:"prize-recovery",name:"A prize",description:null,value:"Reward",judgingStyle:"weighted_score",maxPicks:null,criteria:[criterion],buckets:null}
    const first=render(<EditPrizeDialog hackathonId="event-recovery" prize={prize} onClose={() => {}} />)
    fireEvent.change(screen.getByDisplayValue("Original question"),{target:{value:"Recovered category"}})
    first.unmount()
    render(<EditPrizeDialog hackathonId="event-recovery" prize={prize} onClose={() => {}} />)
    expect(screen.getByDisplayValue("Recovered category")).toBeDefined()
    let body: {criteria?:Array<{id:string;name:string}>}={}
    globalThis.fetch=mock((_url,init) => {body=JSON.parse(String(init?.body));return Promise.resolve(new Response(JSON.stringify({prize:{id:prize.id}}),{status:200}))}) as typeof fetch
    fireEvent.click(screen.getByRole("button",{name:"Save"}))
    await waitFor(() => expect(body.criteria?.[0]).toMatchObject({id:criterion.id,name:"Recovered category"}))
  })
})
