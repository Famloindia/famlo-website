"use client";

import { useState } from "react";
import styles from "../dashboard.module.css";
import { ShieldAlert, FileCheck, FileText, Upload, Clock, Loader2, Send } from "lucide-react";

interface ComplianceTabProps {
  compliance: {
    pccFileName?: string;
    propertyProofFileName?: string;
    formCFileName?: string;
    adminNotes?: string;
  };
  setCompliance: (c: any) => void;
  onSave: () => void;
  saving?: boolean;
}

export default function ComplianceTab({ compliance, setCompliance, onSave, saving }: ComplianceTabProps) {
  const [lastSubmitted, setLastSubmitted] = useState<string | null>(null);

  const docs = [
    { id: 'pcc', label: 'Police Clearance Certificate (PCC)', icon: <FileCheck className="text-emerald-600" />, desc: 'Mandatory verification from local police station.' },
    { id: 'property', label: 'Property Ownership / Lease Proof', icon: <FileText className="text-blue-600" />, desc: 'Registry documents or valid rental agreement.' },
    { id: 'formc', label: 'Form C / FRRO Registration', icon: <ShieldAlert className="text-orange-600" />, desc: 'Required for hosting international travelers.' }
  ];

  const handleFileClick = (id: string) => {
    // Simulated upload for professional UI flow
    const fileName = `UPLOADED_${id.toUpperCase()}_DOC.pdf`;
    setCompliance({ ...compliance, [`${id}FileName`]: fileName });
  };

  return (
    <div className={styles.tabContent}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Compliance & Verification</h2>
        <p className={styles.sectionSubtitle}>Ensure your listing remains active by submitting the required heritage documentation.</p>
      </div>

      <div className={styles.formGrid}>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', padding: '16px 24px', borderRadius: '16px', display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '32px' }}>
            <div style={{ background: '#ef4444', borderRadius: '50%', padding: '8px' }}><ShieldAlert size={20} color="white" /></div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 900, color: '#991b1b' }}>Pending Compliance Requirements</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#b91c1c' }}>Your listing is currently in &apos;Review&apos; mode. Payments will be unlocked once the following documents are approved.</div>
            </div>
          </div>
        </div>

        {docs.map((doc) => {
          const isUploaded = !!(compliance as any)[`${doc.id}FileName`];
          return (
            <div key={doc.id} className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
              <div style={{ background: 'white', border: '2px solid #f1f5f9', borderRadius: '24px', padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                  <div style={{ width: '56px', height: '56px', background: '#f8fafc', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {doc.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 900, color: '#0e2b57' }}>{doc.label}</div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>{doc.desc}</div>
                  </div>
                </div>
                <div>
                  {isUploaded ? (
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#059669' }}>Submitted</div>
                        <div style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8' }}>{(compliance as any)[`${doc.id}FileName`]}</div>
                      </div>
                      <button className={styles.secondaryBtn} style={{ padding: '10px 20px', borderRadius: '12px', minWidth: 'auto' }} onClick={() => handleFileClick(doc.id)}>Re-upload</button>
                    </div>
                  ) : (
                    <button className={styles.primaryBtn} onClick={() => handleFileClick(doc.id)} style={{ padding: '12px 24px', borderRadius: '12px', minWidth: 'auto' }}>
                       <Upload size={16} /> <span style={{ marginLeft: '8px' }}>Upload Document</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <div className={styles.formGroup} style={{ gridColumn: '1 / -1', marginTop: '24px' }}>
          <label style={{ fontSize: '11px', fontWeight: 900, color: '#165dcc', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', display: 'block' }}>Compliance Note for Famlo Team</label>
          <div style={{ position: 'relative' }}>
             <textarea 
               className={styles.inputArea} 
               value={compliance.adminNotes} 
               onChange={e => setCompliance({ ...compliance, adminNotes: e.target.value })}
               placeholder="Write any additional context for the verification team here... (e.g. 'PCC scheduled for next Monday')"
               style={{ minHeight: '140px', padding: '20px', borderRadius: '24px' }}
             />
             <div style={{ position: 'absolute', bottom: '16px', right: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button 
                  className={styles.primaryBtn} 
                  onClick={() => {
                    onSave();
                    setLastSubmitted(new Date().toLocaleTimeString());
                  }}
                  disabled={saving}
                  style={{ borderRadius: '16px', padding: '12px 24px' }}
                >
                  {saving ? <Loader2 className="animate-spin" size={18} /> : (
                    <><Send size={16} /><span style={{ marginLeft: '8px' }}>Send to Famlo</span></>
                  )}
                </button>
             </div>
          </div>
          {lastSubmitted && (
            <p style={{ marginTop: '12px', fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
               <Clock size={12} /> Last submitted to team at {lastSubmitted}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
