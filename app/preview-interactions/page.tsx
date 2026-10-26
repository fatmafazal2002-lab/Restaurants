'use client';
import {ActivityChart,StatusDonut} from '@/components/activity-chart';
import {ServiceProgress} from '@/components/service-progress';
import {useNotifications} from '@/components/notifications';
import {PreferenceControls} from '@/components/preferences';
export default function Preview(){const {notify}=useNotifications();return <main className="themed" style={{padding:30}}><h1>Interaction preview · sample data</h1><PreferenceControls/><div className="chart-pair"><ActivityChart data={[{day:'2026-10-20',orders:12},{day:'2026-10-21',orders:26},{day:'2026-10-22',orders:18},{day:'2026-10-23',orders:34},{day:'2026-10-24',orders:42},{day:'2026-10-25',orders:29},{day:'2026-10-26',orders:36}]}/><StatusDonut values={[{name:'Served',value:31,color:'#4c9274'},{name:'Open',value:5,color:'#b89453'},{name:'Cancelled',value:2,color:'#b16b70'}]}/></div><ServiceProgress orders={[]} onStage={status=>notify(`${status} queue opened`,'info')}/><button className="button button-primary" onClick={()=>notify('Order sent to the kitchen')}>Test confirmation</button></main>}
