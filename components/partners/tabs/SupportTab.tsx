"use client";

import { useCallback, useEffect, useState } from "react";
import { 
  Send, 
  Clock, 
  CheckCircle2, 
  MessageSquare, 
  AlertCircle,
  HelpCircle,
  Loader2,
  ChevronRight,
  ShieldCheck
} from "lucide-react";
import styles from "../dashboard.module.css";
import { createBrowserSupabaseClient } from "@/lib/supabase";

interface SupportTicket {
  id: string;
  subject: string;
  message: string;
  status: "open" | "in_progress" | "resolved";
  admin_reply: string | null;
  created_at: string;
}

interface SupportTabProps {
  familyId: string;
  hostCode: string;
  hostName: string;
}

export default function SupportTab({ hostCode, hostName }: SupportTabProps) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [success, setSuccess] = useState(false);

  const supabase = createBrowserSupabaseClient();

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("host_id", hostCode)
      .order("created_at", { ascending: false });

    if (!error && data) setTickets(data);
    setLoading(false);
  }, [hostCode, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchTickets();
  }, [fetchTickets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !message) return;
    setSubmitting(true);

    const { error } = await supabase.from("support_tickets").insert({
      host_id: hostCode,
      host_name: hostName,
      subject,
      message,
      status: "open"
    });

    if (!error) {
      setSuccess(true);
      setSubject("");
      setMessage("");
      void fetchTickets();
      setTimeout(() => {
        setSuccess(false);
        setShowForm(false);
      }, 2000);
    }
    setSubmitting(false);
  };

  return (
    <div className={`${styles.flexCol} ${styles.animateIn}`} style={{ gap: "32px" }}>
      
      {/* Header Context */}
      <div className={styles.glassCard} style={{ background: 'linear-gradient(135deg, #0e2b57 0%, #165dcc 100%)', color: 'white', border: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '8px' }}>Support & Resolution</h2>
            <p style={{ fontSize: '14px', opacity: 0.8, fontWeight: 500 }}>
              Need help with a booking or payout? Message the Team Famlo directly.
            </p>
          </div>
          <button 
            onClick={() => setShowForm(!showForm)}
            style={{ 
              padding: '12px 24px', 
              borderRadius: '12px', 
              background: 'white', 
              color: '#0e2b57', 
              fontWeight: 900, 
              border: 'none', 
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            {showForm ? "Cancel Inquiry" : "Raise New Query"}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className={styles.glassCard} style={{ border: '2px solid #165dcc', animation: 'slideDown 0.3s ease' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 900, marginBottom: '20px', color: '#0e2b57' }}>What can we help you with?</h3>
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '12px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Subject</label>
            <input 
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., Payout for Booking #1234 not received"
              style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#f8fafc', outline: 'none', fontFamily: 'inherit' }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ fontSize: '12px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Detailed Message</label>
            <textarea 
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us more about the issue..."
              style={{ width: '100%', minHeight: '120px', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#f8fafc', outline: 'none', fontFamily: 'inherit', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              type="submit" 
              disabled={submitting || success}
              style={{ 
                padding: '14px 32px', 
                borderRadius: '12px', 
                background: success ? '#10b981' : '#165dcc', 
                color: 'white', 
                fontWeight: 900, 
                border: 'none', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {submitting ? <Loader2 className="animate-spin" size={18} /> : success ? <><CheckCircle2 size={18} /> Sent Successfully</> : <><Send size={18} /> Submit to Team Famlo</>}
            </button>
          </div>
        </form>
      )}

      {/* Tickets List */}
      <div className={styles.flexCol} style={{ gap: '16px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Past Inquiries</h3>
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}><Loader2 className="animate-spin" size={32} color="#165dcc" /></div>
        ) : tickets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: '#f8fafc', borderRadius: '24px', border: '1px dashed #e2e8f0' }}>
            <HelpCircle size={40} color="#94a3b8" style={{ marginBottom: '16px' }} />
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#64748b' }}>No support tickets found. Your account is in good standing!</p>
          </div>
        ) : (
          tickets.map((ticket) => (
            <div key={ticket.id} className={styles.glassCard} style={{ padding: '0', overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
              <div style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                    <div style={{ 
                      padding: '8px', 
                      background: ticket.status === 'resolved' ? '#f0fdf4' : '#f8fafc', 
                      borderRadius: '50%',
                      color: ticket.status === 'resolved' ? '#10b981' : '#64748b'
                    }}>
                      <HelpCircle size={18} />
                    </div>
                    <div>
                      <h4 style={{ fontSize: '16px', fontWeight: 900, color: '#0e2b57', margin: '0 0 4px' }}>{ticket.subject}</h4>
                      <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>
                        Submitted on {new Date(ticket.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div style={{ 
                    fontSize: '10px', 
                    fontWeight: 900, 
                    padding: '4px 10px', 
                    borderRadius: '6px', 
                    background: ticket.status === 'resolved' ? '#dcfce7' : '#f1f5f9',
                    color: ticket.status === 'resolved' ? '#15803d' : '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    {ticket.status}
                  </div>
                </div>
                <p style={{ fontSize: '14px', color: '#334155', lineHeight: 1.6, margin: '0', paddingLeft: '48px' }}>{ticket.message}</p>
              </div>

              {ticket.admin_reply && (
                <div style={{ background: '#f8fafc', padding: '24px', borderTop: '1px solid #f1f5f9', borderLeft: '4px solid #165dcc' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                    <div style={{ padding: '8px', background: '#eff6ff', borderRadius: '50%', color: '#165dcc' }}>
                      <CheckCircle2 size={18} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '11px', fontWeight: 900, color: '#165dcc', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.05em' }}>Verified Team Response</div>
                      <p style={{ fontSize: '14px', fontWeight: 600, color: '#0e2b57', lineHeight: 1.5, margin: 0 }}>{ticket.admin_reply}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Safety Banner */}
      <div style={{ padding: '24px', background: '#f1f5f9', borderRadius: '20px', display: 'flex', gap: '16px', alignItems: 'center' }}>
        <AlertCircle size={20} color="#64748b" />
        <p style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', margin: 0 }}>
          For urgent emergencies or safety concerns, please use the direct WhatsApp support button in your Listing View or call our 24/7 Priority Partner Line.
        </p>
      </div>
    </div>
  );
}
