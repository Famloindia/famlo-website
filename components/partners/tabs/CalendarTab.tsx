import { useState, useMemo } from "react";
import styles from "../dashboard.module.css";
import { X, Calendar as CalendarIcon, Ban, Clock, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { isPastDateInIndia } from "@/lib/booking-time";
import ChannelManagerTab from "./ChannelManagerTab";

function getStatusPriority(status: string | null | undefined): number {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "confirmed" || normalized === "accepted" || normalized === "checked_in" || normalized === "completed") {
    return 4;
  }
  if (normalized === "awaiting_payment") {
    return 3;
  }
  if (normalized === "pending") {
    return 2;
  }
  return 1;
}

function getDisplayBookingsForDate(bookingRows: any[], dayStr: string) {
  const relevant = bookingRows.filter((booking: any) => String(booking.date_from).startsWith(dayStr));
  const deduped = new Map<string, any>();

  for (const booking of relevant) {
    const guestId = String(booking.user_id ?? booking.users?.id ?? booking.users?.name ?? "guest");
    const bookingKey = [
      guestId,
      String(booking.date_from ?? ""),
      String(booking.date_to ?? ""),
      String(booking.quarter_type ?? ""),
    ].join("::");
    const current = deduped.get(bookingKey);

    if (!current || getStatusPriority(booking.status) > getStatusPriority(current.status)) {
      deduped.set(bookingKey, booking);
    }
  }

  return Array.from(deduped.values()).sort(
    (left, right) => getStatusPriority(right.status) - getStatusPriority(left.status)
  );
}

export default function CalendarTab({ schedule, setSchedule, bookingRows, onSave, saving, hostId }: any) {
  const [insightDay, setInsightDay] = useState<number | null>(null);
  const [selectedStayUnitId, setSelectedStayUnitId] = useState<string>("all");
  
  const now = new Date();
  const [viewDate, setViewDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  
  const yearMonth = `${viewDate.getFullYear()}-${(viewDate.getMonth() + 1).toString().padStart(2, '0')}`;
  const monthName = viewDate.toLocaleString('default', { month: 'long' });

  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();
  // Native JS getDay() is 0 for Sunday, which matches our new Sunday-first grid
  const emptyDays = firstDayOfMonth;
  const roomOptions = useMemo(() => {
    const seen = new Set<string>();
    return bookingRows
      .map((booking: any, index: number) => {
        const stayUnitId = typeof booking.stay_unit_id === "string" ? booking.stay_unit_id : null;
        if (!stayUnitId || seen.has(stayUnitId)) {
          return null;
        }
        seen.add(stayUnitId);
        const roomName =
          typeof booking.room_name === "string" && booking.room_name.trim().length > 0
            ? booking.room_name.trim()
            : `Room ${index + 1}`;
        return { id: stayUnitId, label: roomName };
      })
      .filter((option: { id: string; label: string } | null): option is { id: string; label: string } => Boolean(option))
      .sort((left: { id: string; label: string }, right: { id: string; label: string }) => left.label.localeCompare(right.label));
  }, [bookingRows]);
  const visibleBookingRows = useMemo(() => {
    if (selectedStayUnitId === "all") {
      return bookingRows;
    }

    return bookingRows.filter((booking: any) => booking.stay_unit_id === selectedStayUnitId);
  }, [bookingRows, selectedStayUnitId]);

  const isDayBlocked = (day: number) => {
    const formatted = `${yearMonth}-${day.toString().padStart(2, '0')}`;
    const blockedList = schedule.blockedDates.split(",").map((i: string) => i.trim()).filter(Boolean);
    return blockedList.includes(formatted);
  };
  
  const toggleBlockDay = (day: number) => {
    const formatted = `${yearMonth}-${day.toString().padStart(2, '0')}`;
    let arr = schedule.blockedDates.split(",").map((i: string) => i.trim()).filter(Boolean);
    let newBlockedDates = "";
    
    if (arr.includes(formatted)) {
       arr = arr.filter((i: string) => i !== formatted);
    } else {
       // Remove all specific slot blocks if we block the whole day
       arr = arr.filter((i: string) => !i.startsWith(`${formatted}::`));
       arr.push(formatted);
    }
    newBlockedDates = arr.join(", ");
    
    const updatedSchedule = { ...schedule, blockedDates: newBlockedDates };
    setSchedule(updatedSchedule);
    onSave({ updatedSchedule }); // Atomic Sync
  };

  const toggleSlotBlock = (day: number, slot: string) => {
    const dateStr = `${yearMonth}-${day.toString().padStart(2, '0')}`;
    const token = `${dateStr}::${slot}`;
    let arr = schedule.blockedDates.split(",").map((i: string) => i.trim()).filter(Boolean);
    
    if (arr.includes(token)) {
      arr = arr.filter((i: string) => i !== token);
    } else {
      // If we add a slot block while the whole day was blocked, we might want to unblock the main day? 
      // Actually, mobile app rule: Day block overrides slot blocks.
      arr = arr.filter((i: string) => i !== dateStr); 
      arr.push(token);
    }
    const newBlockedDates = arr.join(", ");
    const updatedSchedule = { ...schedule, blockedDates: newBlockedDates };
    setSchedule(updatedSchedule);
    onSave({ updatedSchedule }); // Atomic Sync
  };

  const blockedCount = schedule.blockedDates.length > 0 ? schedule.blockedDates.split(",").filter((i: string) => i.includes('-')).length : 0;

  return (
    <div className={`${styles.flexCol} ${styles.animateIn}`} style={{ gap: '32px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #f1f5f9', paddingBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 900, margin: '0 0 4px', color: '#0e2b57' }}>Calendar Control</h2>
          <p style={{ fontSize: '13px', margin: 0, color: 'rgba(14,43,87,0.6)', fontWeight: 600 }}>Block specific days or quarters instantly.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {roomOptions.length > 0 ? (
            <select
              value={selectedStayUnitId}
              onChange={(event) => setSelectedStayUnitId(event.target.value)}
              style={{
                border: '1px solid #dbe4f0',
                borderRadius: '10px',
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 800,
                color: '#0e2b57',
                background: 'white',
              }}
            >
              <option value="all">All rooms</option>
              {roomOptions.map((room: { id: string; label: string }) => (
                <option key={room.id} value={room.id}>
                  {room.label}
                </option>
              ))}
            </select>
          ) : null}
           <div style={{ background: '#fef2f2', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 900, color: '#ef4444' }}>
             {blockedCount} BLOCKS ACTIVE
           </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '32px' }}>
        {/* Main Calendar Card */}
        <div className={styles.glassCard} style={{ padding: 0, overflow: 'hidden', border: '1px solid rgba(14,43,87,0.08)' }}>
          <div style={{ background: '#0e2b57', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white' }}>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>{monthName} {viewDate.getFullYear()}</h3>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}><ChevronLeft size={18} /></button>
              <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}><ChevronRight size={18} /></button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#f8fafc', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: '11px', fontWeight: 900, color: 'rgba(14,43,87,0.4)', textTransform: 'uppercase' }}>{d}</div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: 'white' }}>
             {Array.from({length: emptyDays}).map((_, i) => <div key={`e-${i}`} style={{ height: '100px', borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }} />)}
             {Array.from({length: daysInMonth}, (_, i) => i + 1).map(day => {
                const blocked = isDayBlocked(day);
                const dayStr = `${yearMonth}-${day.toString().padStart(2, '0')}`;
                const isPastDay = isPastDateInIndia(dayStr);
                const dayBookings = getDisplayBookingsForDate(visibleBookingRows, dayStr).filter(
                  (b: any) =>
                    b.status === "confirmed" ||
                    b.status === "accepted" ||
                    b.status === "pending" ||
                    b.status === "awaiting_payment" ||
                    b.status === "checked_in" ||
                    b.status === "completed"
                );
                const booked = dayBookings.length > 0;
                
                return (
                  <button key={day} onClick={() => {
                    if (isPastDay) return;
                    setInsightDay(day);
                  }} 
                    className={styles.calendarDayBtn}
                    style={{ 
                      height: '100px', background: isPastDay ? '#f8fafc' : blocked ? '#fef2f2' : 'white', 
                      border: 'none', padding: '12px', cursor: isPastDay ? 'not-allowed' : 'pointer', position: 'relative',
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                      borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9',
                      transition: 'background 0.2s',
                      opacity: isPastDay ? 0.5 : 1
                    }}>
                    <span style={{ fontSize: '15px', fontWeight: 900, color: isPastDay ? '#94a3b8' : blocked ? '#ef4444' : '#0e2b57' }}>{day}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px', width: '100%' }}>
                      {booked && !blocked && !isPastDay && (
                        <div style={{ background: '#eef2ff', color: '#4f46e5', fontSize: '9px', fontWeight: 900, padding: '4px 8px', borderRadius: '6px', textAlign: 'left', textTransform: 'uppercase' }}>
                          {dayBookings.length} Bookings
                        </div>
                      )}
                      {isPastDay && (
                        <div style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>
                          Past date
                        </div>
                      )}
                      {blocked && (
                        <div style={{ color: '#ef4444', opacity: 0.4, position: 'absolute', right: '8px', top: '8px' }}>
                          <Ban size={16} />
                        </div>
                      )}
                    </div>
                  </button>
                )
             })}
          </div>
        </div>

        {/* Sidebar Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

           <button className={`${styles.primaryBtn} ${styles.successBtn}`} onClick={() => onSave()} disabled={saving} style={{ padding: '16px' }}>
              {saving ? "Syncing..." : "Manual Database Sync"}
           </button>
        </div>
      </div>

      {hostId ? (
        <section className={styles.glassCard} style={{ padding: "24px" }}>
          <ChannelManagerTab
            ownerType="host"
            ownerId={hostId}
            title="Channel Sync"
            description="Connect and review host-wide calendar feeds from one place."
          />
        </section>
      ) : null}

      {/* Day Insight Modal */}
      {insightDay && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ maxWidth: '600px' }}>
             <div className={styles.modalHeader} style={{ borderBottom: 'none' }}>
               <div>
                  <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#0e2b57', margin: 0 }}>
                    {monthName} {insightDay}, {viewDate.getFullYear()}
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'rgba(14,43,87,0.6)', fontWeight: 600 }}>Daily Inventory & Booking Insight</p>
               </div>
               <button onClick={() => setInsightDay(null)} style={{ background: '#f4f8ff', border: 'none', cursor: 'pointer', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={20} color="#0e2b57" /></button>
             </div>
             
             <div className={styles.modalBody}>
                {/* Bookings Section */}
                <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '20px', border: '1px solid #f1f5f9', marginBottom: '32px' }}>
                   <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: '#165dcc', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                     <CheckCircle2 size={14} /> Active Booking Holds & Guests
                   </div>
                   {getDisplayBookingsForDate(visibleBookingRows, `${yearMonth}-${insightDay.toString().padStart(2, '0')}`).map((booking: any) => (
                      <div key={booking.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: 'white', borderRadius: '14px', marginBottom: '12px', border: '1px solid #f1f5f9' }}>
                         <div style={{ width: '44px', height: '44px', background: '#eef2ff', color: '#4f46e5', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '18px' }}>
                           {(booking.users?.name || 'G')[0]}
                         </div>
                         <div style={{ flex: 1 }}>
                           <h4 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 900, color: '#0e2b57' }}>{booking.users?.name || `Verified Guest`}</h4>
                           <div style={{ fontSize: '12px', color: 'rgba(14,43,87,0.6)', fontWeight: 600 }}>
                             {booking.status} · {booking.quarter_type} session · {booking.guests_count} Guests{booking.room_name ? ` · ${booking.room_name}` : ""}
                           </div>
                         </div>
                         <div style={{ textAlign: 'right' }}>
                           <div style={{ fontSize: '16px', fontWeight: 900, color: '#059669' }}>₹{booking.total_price}</div>
                         </div>
                      </div>
                   ))}
                   {getDisplayBookingsForDate(visibleBookingRows, `${yearMonth}-${insightDay.toString().padStart(2, '0')}`).length === 0 && (
                      <p style={{ margin: 0, fontSize: '14px', color: 'rgba(14,43,87,0.6)', fontWeight: 700, textAlign: 'center', padding: '16px 0' }}>No active bookings for this day.</p>
                   )}
                </div>

                {/* Blocking Controls */}
                <div>
                   <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: '#ef4444', marginBottom: '20px' }}>Inventory Management</div>
                   
                   {/* Full Day Toggle */}
                   <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', border: '2px solid #fef2f2', borderRadius: '20px', background: isDayBlocked(insightDay) ? '#fff1f2' : 'white', marginBottom: '24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '48px', height: '48px', background: isDayBlocked(insightDay) ? '#ef4444' : '#fee2e2', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Ban size={24} color={isDayBlocked(insightDay) ? 'white' : '#ef4444'} />
                        </div>
                        <div>
                          <h4 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 900, color: '#0e2b57' }}>Block Day Completely</h4>
                          <p style={{ margin: 0, fontSize: '12px', color: 'rgba(14, 43, 87, 0.6)', fontWeight: 600 }}>Shut down all quarters for this date.</p>
                        </div>
                      </div>
                      <label className={styles.iosToggleLabel}>
                        <input type="checkbox" className={styles.iosToggleInput} checked={isDayBlocked(insightDay)} onChange={() => toggleBlockDay(insightDay)} />
                        <div className={styles.iosToggleTrack} style={{ background: isDayBlocked(insightDay) ? '#ef4444' : '#cbd5e1' }}>
                          <div className={styles.iosToggleThumb} style={{ transform: isDayBlocked(insightDay) ? 'translateX(22px)' : 'translateX(0)' }}></div>
                        </div>
                      </label>
                   </div>

                   {/* Quarter Sections */}
                   <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                     {['morning', 'afternoon', 'evening', 'fullday'].map(q => {
                        const dateStr = `${yearMonth}-${insightDay.toString().padStart(2, '0')}`;
                        const isGloballyOff = !schedule.activeQuarters.split(",").map((i: string) => i.trim()).includes(q);
                        const token = `${dateStr}::${q}`;
                        const blockedList = schedule.blockedDates.split(",").map((i: string) => i.trim()).filter(Boolean);
                        
                        const isQBlocked = isDayBlocked(insightDay) || blockedList.includes(token);
                        const qBooked = visibleBookingRows.find((b: any) => 
                           String(b.date_from).startsWith(dateStr) && 
                           (b.quarter_type === q || b.quarter_type === 'fullday') &&
                           (b.status !== "cancelled")
                        );
                        const isDisabled = !!qBooked || isDayBlocked(insightDay) || isGloballyOff;

                        return (
                          <div key={q} style={{ display: 'flex', flexDirection: 'column', padding: '16px', border: '1px solid #f1f5f9', borderRadius: '16px', background: isQBlocked ? '#fef2f2' : isGloballyOff ? '#f8fafc' : 'white', opacity: isGloballyOff ? 0.7 : 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                               <span style={{ fontSize: '13px', fontWeight: 900, textTransform: 'capitalize', color: isQBlocked ? '#ef4444' : '#0e2b57' }}>{q} session</span>
                               <label className={styles.iosToggleLabel}>
                                 <input type="checkbox" disabled={isDisabled} className={styles.iosToggleInput} checked={isQBlocked} onChange={() => toggleSlotBlock(insightDay, q)} />
                                 <div style={{ opacity: isDisabled ? 0.5 : 1 }}>
                                   <div className={styles.iosToggleTrack} style={{ scale: '0.8', background: isQBlocked ? '#ef4444' : '#cbd5e1' }}><div className={styles.iosToggleThumb} style={{ transform: isQBlocked ? 'translateX(22px)' : 'translateX(0)' }}></div></div>
                                 </div>
                               </label>
                            </div>
                            <p style={{ margin: 0, fontSize: '11px', color: 'rgba(14,43,87,0.5)', fontWeight: 800 }}>
                              {!!qBooked ? `Reserved by ${qBooked.users?.name}` : isGloballyOff ? "Inactive in settings" : isQBlocked ? "Blocked by you" : "Available"}
                            </p>
                          </div>
                        )
                     })}
                   </div>
                </div>
             </div>
             
             <div className={styles.modalFooter} style={{ borderTop: 'none', paddingTop: 0 }}>
               <button className={`${styles.primaryBtn} ${styles.successBtn}`} style={{ width: '100%', padding: '16px', fontWeight: 900, borderRadius: '16px' }} onClick={() => setInsightDay(null)}>Finish Management</button>
             </div>
          </div>
        </div>
      )}

    </div>
  )
}
