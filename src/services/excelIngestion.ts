/**
 * Excel / CSV Ingestion, Deduplication & Export Engine
 * Narayana Prodigy Student Relation Call Management CRM
 */

import * as XLSX from 'xlsx';
import {
  AttendanceAggregation,
  AttendanceRecord,
  CallDisposition,
  CallLog,
  Campaign,
  ExamResult,
  ExternalLead,
  Student,
} from '../types/crm';
import { getTodayCalendarDate } from './antiCheat';

export interface IngestionResult<T> {
  successCount: number;
  updatedCount: number;
  duplicateCount: number;
  errorCount: number;
  errors: string[];
  records: T[];
}

/**
 * Normalizes strings for case-insensitive and whitespace-trimmed matching
 */
function normalizeKey(str: string | undefined): string {
  return (str || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function cleanDigits(phone: string | undefined): string {
  return (phone || '').replace(/\D/g, '');
}

/**
 * Parses Master Admission Sheet (22 standard attributes)
 * Handles Upsert by admission_no and Fuzzy Deduplication by [LOWER(user_name) + LOWER(father_name) + mobile]
 */
export async function parseMasterAdmissions(
  file: File,
  existingStudents: Student[]
): Promise<IngestionResult<Student>> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  // Map of existing admission_no
  const existingByAdmission = new Map<string, Student>();
  // Map of composite keys: `${normalizeKey(name)}|${normalizeKey(father)}|${cleanDigits(mobile)}` -> Student
  const existingByComposite = new Map<string, Student>();

  existingStudents.forEach((s) => {
    existingByAdmission.set(s.admission_no.trim(), s);
    const compositeKey = `${normalizeKey(s.user_name)}|${normalizeKey(s.father_name)}|${cleanDigits(s.student_mobile)}`;
    existingByComposite.set(compositeKey, s);
  });

  const processedStudents: Student[] = [];
  const errors: string[] = [];
  let successCount = 0;
  let updatedCount = 0;
  let duplicateCount = 0;

  rows.forEach((row, index) => {
    const rowIdx = index + 2;
    const admission_no = String(row['Admission No'] || row['admission_no'] || row['ADMISSION_NO'] || '').trim();

    if (!admission_no) {
      errors.push(`Row ${rowIdx}: Missing required Admission No. Skipped.`);
      return;
    }

    const userName = String(row['Student Name'] || row['user_name'] || row['Student Full Name'] || '').trim();
    const fatherName = String(row['Father Name'] || row['father_name'] || '').trim();
    const motherName = String(row['Mother Name'] || row['mother_name'] || '').trim();
    const studentMobile = String(row['Mobile'] || row['student_mobile'] || row['Phone'] || '').trim();
    const whatsapp = String(row['WhatsApp'] || row['whatsapp_number'] || studentMobile).trim();
    const email = String(row['Email'] || row['email'] || '').trim();
    const gender = String(row['Gender'] || row['gender'] || 'M').trim();
    const dob = String(row['DOB'] || row['dob'] || '2008-05-15').trim();
    const category = String(row['Category'] || row['category'] || 'General').trim();
    const address = String(row['Address'] || row['address'] || '').trim();
    const city = String(row['City'] || row['city'] || 'Hyderabad').trim();
    const stateName = String(row['State'] || row['state_name'] || 'Telangana').trim();
    const districtName = String(row['District'] || row['district_name'] || city).trim();
    const pinCode = String(row['PIN'] || row['pin_code'] || '500072').trim();
    const courseName = String(row['Course Name'] || row['course_name'] || 'Prodigy Super 60').trim();
    const courseType = String(row['Course Type'] || row['course_type'] || 'Residential').trim();
    const courseGroup = String(row['Course Group'] || row['course_group'] || 'IIT-JEE Advanced').trim();
    const courseClass = String(row['Class'] || row['course_class'] || 'Class 11').trim();
    const mentorName = String(row['Mentor'] || row['mentor_name'] || '').trim();
    const courseCategory = String(row['Course Category'] || row['course_category'] || 'Long Term Target').trim();
    const academicYear = String(row['Academic Year'] || row['academic_year'] || '2025-2026').trim();
    const batchName = String(row['Batch'] || row['batch_name'] || `${courseGroup} Batch A`).trim();

    const compositeKey = `${normalizeKey(userName)}|${normalizeKey(fatherName)}|${cleanDigits(studentMobile)}`;

    // 1. Primary Check: Exact Admission No match -> UPSERT
    if (existingByAdmission.has(admission_no)) {
      const prev = existingByAdmission.get(admission_no)!;
      const updated: Student = {
        ...prev,
        academic_year: academicYear || prev.academic_year,
        user_name: userName || prev.user_name,
        father_name: fatherName || prev.father_name,
        mother_name: motherName || prev.mother_name,
        student_mobile: studentMobile || prev.student_mobile,
        whatsapp_number: whatsapp || prev.whatsapp_number,
        email: email || prev.email,
        gender: gender || prev.gender,
        dob: dob || prev.dob,
        category: category || prev.category,
        address: address || prev.address,
        city: city || prev.city,
        state_name: stateName || prev.state_name,
        district_name: districtName || prev.district_name,
        pin_code: pinCode || prev.pin_code,
        course_name: courseName || prev.course_name,
        course_type: courseType || prev.course_type,
        course_group: courseGroup || prev.course_group,
        course_class: courseClass || prev.course_class,
        mentor_name: mentorName || prev.mentor_name,
        course_category: courseCategory || prev.course_category,
        batch_name: batchName || prev.batch_name,
        updated_at: new Date().toISOString(),
      };
      processedStudents.push(updated);
      updatedCount++;
      return;
    }

    // 2. Fuzzy Duplicate Bucket: Novel admission_no but matching name + father + mobile
    let isPotentialDuplicate = false;
    let duplicateReason: string | undefined = undefined;
    let matchedAdmissionNo: string | undefined = undefined;

    if (existingByComposite.has(compositeKey)) {
      const matched = existingByComposite.get(compositeKey)!;
      isPotentialDuplicate = true;
      duplicateReason = `Matched Name, Father Name & Mobile with existing Admission No: ${matched.admission_no}`;
      matchedAdmissionNo = matched.admission_no;
      duplicateCount++;
    }

    const newStudent: Student = {
      admission_no,
      academic_year: academicYear,
      user_name: userName || 'Student',
      father_name: fatherName || 'Parent',
      mother_name: motherName,
      student_mobile: studentMobile,
      whatsapp_number: whatsapp,
      email,
      gender,
      dob,
      category,
      address,
      city,
      state_name: stateName,
      district_name: districtName,
      pin_code: pinCode,
      course_name: courseName,
      course_type: courseType,
      course_group: courseGroup,
      course_class: courseClass,
      mentor_name: mentorName || undefined,
      course_category: courseCategory,
      batch_name: batchName,
      is_potential_duplicate: isPotentialDuplicate,
      duplicate_reason: duplicateReason,
      duplicate_resolution: isPotentialDuplicate ? 'PENDING' : undefined,
      matched_admission_no: matchedAdmissionNo,
      enrollment_status: 'Confirmed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      call_status_today: 'NEVER_CALLED',
    };

    processedStudents.push(newStudent);
    // register in local lookup maps so subsequent rows in the same sheet detect duplicates
    existingByAdmission.set(admission_no, newStudent);
    if (!isPotentialDuplicate) {
      existingByComposite.set(compositeKey, newStudent);
    }
    successCount++;
  });

  return {
    successCount,
    updatedCount,
    duplicateCount,
    errorCount: errors.length,
    errors,
    records: processedStudents,
  };
}

/**
 * Parses Subject-Wise Exam Results Sheet
 * Format: [admission_no, exam_name, exam_date, physics_marks, chemistry_marks, math_marks, biology_marks, total_marks, max_marks, rank]
 */
export async function parseExamResults(file: File): Promise<IngestionResult<ExamResult>> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const records: ExamResult[] = [];
  const errors: string[] = [];
  let successCount = 0;

  rows.forEach((row, index) => {
    const rowIdx = index + 2;
    const admission_no = String(row['Admission No'] || row['admission_no'] || '').trim();

    if (!admission_no) {
      errors.push(`Row ${rowIdx}: Missing Admission No. Skipped.`);
      return;
    }

    const examName = String(row['Exam Name'] || row['exam_name'] || 'Periodic Grand Test').trim();
    const examDate = String(row['Exam Date'] || row['exam_date'] || getTodayCalendarDate()).trim();
    const physics = Number(row['Physics'] || row['physics_marks'] || 0);
    const chemistry = Number(row['Chemistry'] || row['chemistry_marks'] || 0);
    const math = Number(row['Maths'] || row['math_marks'] || 0);
    const biology = Number(row['Biology'] || row['biology_marks'] || 0);
    const maxMarks = Number(row['Max Marks'] || row['max_marks'] || 300);
    const totalMarks = Number(row['Total Marks'] || row['total_marks'] || physics + chemistry + math + biology);
    const rank = row['Rank'] || row['rank'] ? Number(row['Rank'] || row['rank']) : undefined;
    const percentage = maxMarks > 0 ? Number(((totalMarks / maxMarks) * 100).toFixed(1)) : 0;

    records.push({
      id: `exam-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      student_id: admission_no,
      exam_name: examName,
      exam_date: examDate,
      physics_marks: physics,
      chemistry_marks: chemistry,
      math_marks: math,
      biology_marks: biology,
      total_marks: totalMarks,
      max_marks: maxMarks,
      percentage,
      rank,
    });
    successCount++;
  });

  return {
    successCount,
    updatedCount: 0,
    duplicateCount: 0,
    errorCount: errors.length,
    errors,
    records,
  };
}

/**
 * Parses Subject & Time-Slot Attendance Sheet
 * Format: [admission_no, date, time_slot, subject, status (P/A/L), faculty]
 */
export async function parseAttendance(file: File): Promise<IngestionResult<AttendanceRecord>> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const records: AttendanceRecord[] = [];
  const errors: string[] = [];
  let successCount = 0;

  rows.forEach((row, index) => {
    const rowIdx = index + 2;
    const admission_no = String(row['Admission No'] || row['admission_no'] || '').trim();

    if (!admission_no) {
      errors.push(`Row ${rowIdx}: Missing Admission No. Skipped.`);
      return;
    }

    const date = String(row['Date'] || row['date'] || getTodayCalendarDate()).trim();
    const timeSlot = String(row['Time Slot'] || row['time_slot'] || '08:30 AM - 10:00 AM').trim();
    const subject = String(row['Subject'] || row['subject'] || 'Physics').trim();
    const rawStatus = String(row['Status'] || row['status'] || 'P').trim().toUpperCase();
    const status: 'P' | 'A' | 'L' = rawStatus === 'A' ? 'A' : rawStatus === 'L' ? 'L' : 'P';
    const faculty = String(row['Faculty'] || row['faculty'] || '').trim() || undefined;

    records.push({
      id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      student_id: admission_no,
      date,
      time_slot: timeSlot,
      subject,
      status,
      faculty,
    });
    successCount++;
  });

  return {
    successCount,
    updatedCount: 0,
    duplicateCount: 0,
    errorCount: errors.length,
    errors,
    records,
  };
}

/**
 * Dynamic Attendance Aggregation (Excel COUNTIF equivalent)
 * Calculates:
 * 1. Overall Percentage: (Total Present / Total Sessions) * 100
 * 2. Per-Subject Count: Present / Total (e.g. Physics: 18/20)
 * 3. Absenteeism Audit List
 */
export function aggregateAttendance(records: AttendanceRecord[]): AttendanceAggregation {
  if (!records || records.length === 0) {
    return {
      totalClasses: 0,
      presentClasses: 0,
      overallPercentage: 100,
      subjectCounts: {},
      absenteeDetails: [],
    };
  }

  let totalClasses = 0;
  let presentClasses = 0;
  const subjectMap: Record<string, { present: number; total: number }> = {};
  const absenteeDetails: AttendanceAggregation['absenteeDetails'] = [];

  records.forEach((r) => {
    totalClasses++;
    if (!subjectMap[r.subject]) {
      subjectMap[r.subject] = { present: 0, total: 0 };
    }
    subjectMap[r.subject].total++;

    if (r.status === 'P') {
      presentClasses++;
      subjectMap[r.subject].present++;
    } else if (r.status === 'A') {
      absenteeDetails.push({
        date: r.date,
        time_slot: r.time_slot,
        subject: r.subject,
        faculty: r.faculty,
      });
    }
  });

  const subjectCounts: AttendanceAggregation['subjectCounts'] = {};
  Object.keys(subjectMap).forEach((subj) => {
    const data = subjectMap[subj];
    subjectCounts[subj] = {
      present: data.present,
      total: data.total,
      percentage: data.total > 0 ? Math.round((data.present / data.total) * 100) : 100,
    };
  });

  const overallPercentage = totalClasses > 0 ? Math.round((presentClasses / totalClasses) * 100) : 100;

  return {
    totalClasses,
    presentClasses,
    overallPercentage,
    subjectCounts,
    absenteeDetails,
  };
}

/**
 * Generates Downloadable Sample Templates (.xlsx)
 */
export function generateSampleTemplate(type: 'ADMISSIONS' | 'EXAMS' | 'ATTENDANCE'): void {
  const wb = XLSX.utils.book_new();

  if (type === 'ADMISSIONS') {
    const sampleData = [
      {
        'Admission No': 'NAR-2026-9001',
        'Academic Year': '2025-2026',
        'Student Name': 'Aarav Reddy',
        'Father Name': 'Venkat Reddy',
        'Mother Name': 'Sunita Reddy',
        'Mobile': '9848022334',
        'WhatsApp': '9848022334',
        'Email': 'aarav.reddy@example.com',
        'Gender': 'M',
        'DOB': '2008-04-12',
        'Category': 'General',
        'Address': 'Flat 402, Srinivasa Towers, Madhapur',
        'City': 'Hyderabad',
        'State': 'Telangana',
        'District': 'Rangareddy',
        'PIN': '500081',
        'Course Name': 'Prodigy Super 60',
        'Course Type': 'Residential',
        'Course Group': 'IIT-JEE Advanced',
        'Class': 'Class 11',
        'Mentor': 'Rajesh Kumar',
        'Course Category': 'Long Term Target',
        'Batch': 'JEE Super 60 - Batch A',
      },
      {
        'Admission No': 'NAR-2026-9002',
        'Academic Year': '2025-2026',
        'Student Name': 'Sanya Verma',
        'Father Name': 'Rakesh Verma',
        'Mother Name': 'Meenakshi Verma',
        'Mobile': '9811055443',
        'WhatsApp': '9811055443',
        'Email': 'sanya.v@example.com',
        'Gender': 'F',
        'DOB': '2008-09-21',
        'Category': 'General',
        'Address': 'B-14, Sector 62',
        'City': 'Noida',
        'State': 'Uttar Pradesh',
        'District': 'Gautam Buddha Nagar',
        'PIN': '201301',
        'Course Name': 'Medical AIIMS Target',
        'Course Type': 'Day Scholar',
        'Course Group': 'NEET-UG',
        'Class': 'Class 11',
        'Mentor': 'Priya Sharma',
        'Course Category': 'Target Medical',
        'Batch': 'NEET AIIMS - Batch M1',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    XLSX.utils.book_append_sheet(wb, ws, 'Master Admissions');
    XLSX.writeFile(wb, 'Narayana_Prodigy_Admissions_Template.xlsx');
  } else if (type === 'EXAMS') {
    const sampleData = [
      {
        'Admission No': 'NAR-2026-9001',
        'Exam Name': 'Grand Test 03 - Full Syllabus',
        'Exam Date': '2026-10-25',
        'Physics': 88,
        'Chemistry': 92,
        'Maths': 85,
        'Biology': 0,
        'Total Marks': 265,
        'Max Marks': 300,
        'Rank': 14,
      },
      {
        'Admission No': 'NAR-2026-9002',
        'Exam Name': 'NEET Major Mock 02',
        'Exam Date': '2026-10-25',
        'Physics': 165,
        'Chemistry': 170,
        'Maths': 0,
        'Biology': 345,
        'Total Marks': 680,
        'Max Marks': 720,
        'Rank': 8,
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    XLSX.utils.book_append_sheet(wb, ws, 'Exam Results');
    XLSX.writeFile(wb, 'Narayana_Prodigy_Exam_Results_Template.xlsx');
  } else {
    const sampleData = [
      {
        'Admission No': 'NAR-2026-9001',
        'Date': '2026-10-28',
        'Time Slot': '08:30 AM - 10:00 AM',
        'Subject': 'Physics',
        'Status': 'P',
        'Faculty': 'Dr. K. V. Rao',
      },
      {
        'Admission No': 'NAR-2026-9001',
        'Date': '2026-10-28',
        'Time Slot': '10:15 AM - 11:45 AM',
        'Subject': 'Chemistry',
        'Status': 'A',
        'Faculty': 'Prof. Ananya',
      },
      {
        'Admission No': 'NAR-2026-9002',
        'Date': '2026-10-28',
        'Time Slot': '08:30 AM - 10:00 AM',
        'Subject': 'Biology',
        'Status': 'P',
        'Faculty': 'Dr. N. Murthy',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance Sheet');
    XLSX.writeFile(wb, 'Narayana_Prodigy_Attendance_Template.xlsx');
  }
}

/**
 * Exports Filtered Students and Call History to Excel (.xlsx)
 */
export function exportFilteredDataToExcel(
  students: Student[],
  callLogs: CallLog[],
  attendanceMap: Record<string, AttendanceAggregation>,
  latestExamsMap: Record<string, ExamResult>
): void {
  const exportRows = students.map((s) => {
    const att = attendanceMap[s.admission_no];
    const exam = latestExamsMap[s.admission_no];
    const lastCall = callLogs
      .filter((c) => c.student_id === s.admission_no)
      .sort((a, b) => new Date(b.call_date).getTime() - new Date(a.call_date).getTime())[0];

    return {
      'Admission No': s.admission_no,
      'Student Full Name': s.user_name,
      'Father Name': s.father_name,
      'Mobile Number': s.student_mobile,
      'WhatsApp Number': s.whatsapp_number,
      'Email': s.email,
      'Course Group': s.course_group,
      'Course Name': s.course_name,
      'Batch': s.batch_name,
      'Class': s.course_class,
      'Assigned Mentor': s.mentor_name || 'Unassigned',
      'Attendance %': att ? `${att.overallPercentage}%` : 'N/A',
      'Absent Classes': att ? att.absenteeDetails.length : 0,
      'Latest Exam': exam ? exam.exam_name : 'No Record',
      'Latest Exam Score': exam ? `${exam.total_marks}/${exam.max_marks} (${exam.percentage}%)` : 'N/A',
      'Latest Exam Rank': exam?.rank || 'N/A',
      'Call Status Today': s.call_status_today || 'NEVER_CALLED',
      'Last Call Date': lastCall ? lastCall.calendar_date : 'Never',
      'Last Disposition': lastCall ? lastCall.disposition : 'None',
      'Last Latency (sec)': lastCall ? lastCall.latency_seconds : 'N/A',
      'Suspicious Call Flag': lastCall?.is_suspicious ? 'YES (Flagged)' : 'Normal',
      'Active Follow-up Date': s.active_reminder_date || 'None',
      'City': s.city,
      'State': s.state_name,
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(exportRows);
  XLSX.utils.book_append_sheet(wb, ws, 'Student Call Audit Export');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  XLSX.writeFile(wb, `Narayana_CRM_Export_${timestamp}.xlsx`);
}

/**
 * Parses Raw External Promotional Leads (Permissive Column Matching)
 */
export async function parseExternalLeads(file: File): Promise<IngestionResult<ExternalLead>> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const records: ExternalLead[] = [];
  const errors: string[] = [];
  let successCount = 0;
  let errorCount = 0;

  rows.forEach((row, idx) => {
    const rowKeys = Object.keys(row);
    const findVal = (keywords: string[]) => {
      const matchedKey = rowKeys.find((k) =>
        keywords.some((w) => k.toLowerCase().trim().replace(/[^a-z0-9]/g, '').includes(w))
      );
      return matchedKey ? String(row[matchedKey]).trim() : '';
    };

    const name = findVal(['name', 'student', 'lead', 'candidate']) || `Lead #${idx + 1}`;
    const rawMobile = findVal(['mobile', 'phone', 'contact', 'cell', 'number']);
    const mobile = cleanDigits(rawMobile);
    const city = findVal(['city', 'location', 'town', 'district']) || 'Not Specified';
    const notes = findVal(['notes', 'remark', 'remarks', 'comment', 'query']) || '';
    const source = findVal(['source', 'campaign', 'channel']) || 'Uploaded Promotional List';

    if (!mobile || mobile.length < 8) {
      errors.push(`Row #${idx + 2}: Missing or invalid mobile number '${rawMobile}'`);
      errorCount++;
      return;
    }

    records.push({
      id: `lead-${Date.now()}-${idx}-${Math.random().toString(36).slice(-4)}`,
      name,
      mobile,
      city,
      source_list: source,
      status: 'NEW',
      notes,
      created_at: new Date().toISOString(),
    });
    successCount++;
  });

  return {
    successCount,
    updatedCount: 0,
    duplicateCount: 0,
    errorCount,
    errors,
    records,
  };
}

/**
 * Unified Master Campaign Reports 1-Click Excel (.xlsx) Exporter
 */
export function exportCampaignReportToExcel(
  campaign: Campaign,
  assignments: { mentor_id: string; mentor_name?: string; completion_status: string }[],
  calls: CallLog[]
): void {
  const campCalls = calls.filter((c) => c.campaign_id === campaign.id);
  const totalAssigned = assignments.length;
  const completed = assignments.filter((a) => a.completion_status === 'COMPLETED').length;
  const connected = campCalls.filter((c) => c.disposition === 'CONNECTED').length;
  const busy = campCalls.filter((c) => c.disposition === 'BUSY').length;
  const callbacks = campCalls.filter((c) => c.disposition === 'CALLBACK_REQUESTED').length;
  const switchedOff = campCalls.filter((c) => c.disposition === 'SWITCHED_OFF').length;
  const noResponse = campCalls.filter((c) => c.disposition === 'RINGING_NO_RESPONSE').length;

  const mentorSet = new Set(assignments.map((a) => a.mentor_name || a.mentor_id));

  const summarySheetData = [
    {
      'Campaign Title': campaign.title,
      'Purpose / Tag': campaign.purpose,
      'Start Date': campaign.start_date,
      'Status': campaign.status,
      'Mentors Assigned Count': mentorSet.size,
      'Mentors Assigned': Array.from(mentorSet).join(', '),
      'Total Calls Assigned': totalAssigned,
      'Total Completed Calls': completed,
      'Connected Calls': connected,
      'Line Busy': busy,
      'Callback Requested': callbacks,
      'Switched Off / Not Reachable': switchedOff,
      'Ringing No Response': noResponse,
      'Connection Rate %': totalAssigned > 0 ? `${Math.round((connected / totalAssigned) * 100)}%` : '0%',
    },
  ];

  const detailSheetData = campCalls.map((c) => ({
    'Call ID': c.id,
    'Campaign Title': campaign.title,
    'Student ID': c.student_id,
    'Mentor Name': c.mentor_name,
    'Call Date': c.calendar_date,
    'Call Time': new Date(c.call_date).toLocaleTimeString(),
    'Disposition': c.disposition,
    'Latency Seconds': c.latency_seconds,
    'Is Suspicious Flag': c.is_suspicious ? 'YES' : 'NO',
    'Call Remark': c.remark,
    'Follow-up Date': c.follow_up_date || 'None',
  }));

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.json_to_sheet(summarySheetData);
  const wsDetail = XLSX.utils.json_to_sheet(detailSheetData);

  XLSX.utils.book_append_sheet(wb, wsSummary, 'Campaign Summary');
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Detailed Call Logs');

  const cleanTitle = campaign.title.replace(/[^a-zA-Z0-9]/g, '_');
  XLSX.writeFile(wb, `Narayana_Campaign_${cleanTitle}_Report.xlsx`);
}

/**
 * Admission Performance & Weekly Reports 1-Click Excel Exporter
 */
export function exportAdmissionConversionReportToExcel(
  reportData: {
    mentorName: string;
    department: string;
    batchName: string;
    admissionsHandled: number;
    callsLogged: number;
    connectedCalls: number;
    conversionRate: string;
  }[],
  dateRangeLabel: string
): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(
    reportData.map((r) => ({
      'Date Range / Period': dateRangeLabel,
      'Mentor Caller Name': r.mentorName,
      'Department': r.department,
      'Batch / Program': r.batchName,
      'Admissions Handled / Enrolled': r.admissionsHandled,
      'Calls Logged': r.callsLogged,
      'Connected Calls': r.connectedCalls,
      'Conversion Rate %': r.conversionRate,
    }))
  );
  XLSX.utils.book_append_sheet(wb, ws, 'Admission Conversion');
  XLSX.writeFile(wb, `Narayana_Admission_Conversion_Report_${dateRangeLabel.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
}

/**
 * Report A: Admission Report Excel (.xlsx) (Section 11.A)
 */
export function exportAdmissionReportToExcel(data: {
  totalAdmissions: number;
  uniqueStudents: number;
  crossBatchCount: number;
  batchBreakdown: Record<string, number>;
  courseBreakdown: Record<string, number>;
  mentorBreakdown: Record<string, number>;
  studentsList: Student[];
  sessionName: string;
}): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Summary KPI & Breakdown
  const summaryRows = [
    { 'Metric': 'Academic Session', 'Value': data.sessionName },
    { 'Metric': 'Total Course Seats (Admissions)', 'Value': data.totalAdmissions },
    { 'Metric': 'Unique Individual Students', 'Value': data.uniqueStudents },
    { 'Metric': 'Cross-Batch Multi-Enrolled Students', 'Value': data.crossBatchCount },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive Summary');

  // Sheet 2: Flat Admissions List
  const detailRows = data.studentsList.map((s) => ({
    'Admission No': s.admission_no,
    'Student Name': s.user_name,
    'Father Name': s.father_name,
    'Mobile': s.student_mobile,
    'Course Name': s.course_name,
    'Batch Name': s.batch_name,
    'Class': s.course_class,
    'Mentor': s.mentor_name || 'Unassigned',
    'Cross Batch?': s.is_cross_batch_enrolled ? 'YES' : 'NO',
  }));
  const wsDetail = XLSX.utils.json_to_sheet(detailRows);
  XLSX.utils.book_append_sheet(wb, wsDetail, 'All Admissions');

  XLSX.writeFile(wb, `Narayana_Admission_Report_${data.sessionName}.xlsx`);
}

/**
 * Report C: Mentor Tracking Excel (.xlsx) (Section 11.C: Summary Sheet + Calls Sheet)
 */
export function exportMentorTrackingToExcel(data: {
  mentorName: string;
  designation: string;
  totalAssigned: number;
  completed: number;
  pending: number;
  suspiciousCount: number;
  calls: CallLog[];
}): void {
  const wb = XLSX.utils.book_new();

  const summary = [
    { 'Attribute': 'Mentor Name', 'Value': data.mentorName },
    { 'Attribute': 'Designation', 'Value': data.designation },
    { 'Attribute': 'Total Assigned Tasks', 'Value': data.totalAssigned },
    { 'Attribute': 'Completed Calls', 'Value': data.completed },
    { 'Attribute': 'Pending Calls', 'Value': data.pending },
    { 'Attribute': 'Total Calls Logged', 'Value': data.calls.length },
    { 'Attribute': 'Suspicious Submissions (<15s)', 'Value': data.suspiciousCount },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summary);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Mentor Summary');

  const callsData = data.calls.map((c) => ({
    'Call ID': c.id,
    'Student Admission No': c.student_id,
    'Call Date (IST)': c.call_date,
    'Time Initiated': c.call_initiated_at,
    'Disposition': c.disposition,
    'Duration (sec)': c.call_duration_sec,
    'Latency (sec)': c.latency_seconds,
    'Suspicious Submission': c.is_suspicious ? 'YES' : 'NO',
    'Campaign Outcome': c.campaign_outcome || 'N/A',
    'All Remarks': c.remark,
    'Scheduled Follow-up': c.follow_up_date ? `${c.follow_up_date} ${c.follow_up_time || ''}` : 'None',
  }));
  const wsCalls = XLSX.utils.json_to_sheet(callsData);
  XLSX.utils.book_append_sheet(wb, wsCalls, 'All Call Logs');

  const cleanName = data.mentorName.replace(/[^a-zA-Z0-9]/g, '_');
  XLSX.writeFile(wb, `Narayana_Mentor_Tracking_${cleanName}.xlsx`);
}

/**
 * Report D: Batch-Wise Call Audit Excel (.xlsx) (Section 11.D: Including 0-call students)
 */
export function exportBatchAuditToExcel(data: {
  batchOrCampaign: string;
  totalStudents: number;
  auditRows: {
    student: Student;
    callsCount: number;
    attemptsCount: number;
    mentorsWhoCalled: string;
    calls: CallLog[];
  }[];
}): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: One row per student (including 0-call students)
  const sheet1Data = data.auditRows.map((r) => ({
    'Admission No': r.student.admission_no,
    'Student Name': r.student.user_name,
    'Father Name': r.student.father_name,
    'Mobile': r.student.student_mobile,
    'Batch Name': r.student.batch_name,
    'Total Calls': r.callsCount,
    'Total Attempts': r.attemptsCount,
    'Mentors Who Called': r.mentorsWhoCalled || 'None (0 calls)',
    'Last Disposition': r.calls[0]?.disposition || 'NEVER_CALLED',
    'Latest Remark': r.calls[0]?.remark || '—',
  }));
  const ws1 = XLSX.utils.json_to_sheet(sheet1Data);
  XLSX.utils.book_append_sheet(wb, ws1, 'Student Summary');

  // Sheet 2: Flat list of all calls
  const allCalls: any[] = [];
  data.auditRows.forEach((r) => {
    r.calls.forEach((c) => {
      allCalls.push({
        'Admission No': r.student.admission_no,
        'Student Name': r.student.user_name,
        'Mentor': c.mentor_name,
        'Call Date (IST)': c.call_date,
        'Initiated At': c.call_initiated_at,
        'Disposition': c.disposition,
        'Duration (sec)': c.call_duration_sec,
        'Latency (sec)': c.latency_seconds,
        'Remark': c.remark,
      });
    });
  });
  const ws2 = XLSX.utils.json_to_sheet(allCalls.length > 0 ? allCalls : [{ 'Notice': 'No calls logged for this selection' }]);
  XLSX.utils.book_append_sheet(wb, ws2, 'Call Activity Detail');

  const cleanName = data.batchOrCampaign.replace(/[^a-zA-Z0-9]/g, '_');
  XLSX.writeFile(wb, `Narayana_Batch_Audit_${cleanName}.xlsx`);
}

/**
 * Cross-Batch Enrollees 1-Click Excel (.xlsx) (Section 8: 3 Sheets)
 */
export function exportCrossBatchEnrolleesToExcel(
  crossBatchStudents: Student[],
  singleCourseStudents: Student[],
  sessionName: string
): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Summary KPI
  const uniqueCross = new Set(crossBatchStudents.map((s) => s.cross_batch_group_key)).size;
  const summary = [
    { 'Metric': 'Academic Session', 'Value': sessionName },
    { 'Metric': 'Unique Cross-Batch Students (2+ Courses)', 'Value': uniqueCross },
    { 'Metric': 'Total Cross-Batch Enrolled Seats', 'Value': crossBatchStudents.length },
    { 'Metric': 'Single-Course Students', 'Value': singleCourseStudents.length },
    { 'Metric': 'Total Course Seats', 'Value': crossBatchStudents.length + singleCourseStudents.length },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summary);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // Sheet 2: Grouped Cross-Batch Students
  const groupedMap = new Map<string, Student[]>();
  crossBatchStudents.forEach((s) => {
    const key = s.cross_batch_group_key || s.admission_no;
    if (!groupedMap.has(key)) groupedMap.set(key, []);
    groupedMap.get(key)!.push(s);
  });

  const groupedRows: any[] = [];
  groupedMap.forEach((list) => {
    const first = list[0];
    const adms = list.map((x) => x.admission_no).join(', ');
    const batches = list.map((x) => `${x.batch_name || x.course_name} (#${x.admission_no})`).join(' | ');
    groupedRows.push({
      'Student Name': first.user_name,
      'Father Name': first.father_name,
      'Mobile': first.student_mobile,
      'Number of Courses': list.length,
      'Admission Numbers': adms,
      'Courses & Batches': batches,
    });
  });
  const wsGrouped = XLSX.utils.json_to_sheet(groupedRows);
  XLSX.utils.book_append_sheet(wb, wsGrouped, 'Cross-Batch Students');

  // Sheet 3: Flat list of all admissions
  const flatRows = crossBatchStudents.map((s) => ({
    'Admission No': s.admission_no,
    'Student Name': s.user_name,
    'Father Name': s.father_name,
    'Mobile': s.student_mobile,
    'Course Name': s.course_name,
    'Batch Name': s.batch_name,
    'Mentor': s.mentor_name || 'Unassigned',
  }));
  const wsFlat = XLSX.utils.json_to_sheet(flatRows);
  XLSX.utils.book_append_sheet(wb, wsFlat, 'All Cross-Batch Seats');

  XLSX.writeFile(wb, `Narayana_Cross_Batch_Enrollees_${sessionName}.xlsx`);
}
