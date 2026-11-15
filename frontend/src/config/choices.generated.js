// GENERATED FILE — do not edit by hand.
// Source: backend/apps/common/choices.py
// Regenerate: cd backend && python manage.py export_choices

/** Every choice list: { Group: [{ value, label }] } */
export const CHOICES = Object.freeze({
  "Role": [
    {
      "value": "SUPER_ADMIN",
      "label": "Super Admin"
    },
    {
      "value": "ADMIN",
      "label": "Admin"
    },
    {
      "value": "FACULTY",
      "label": "Faculty"
    },
    {
      "value": "STUDENT",
      "label": "Student"
    }
  ],
  "AccountStatus": [
    {
      "value": "ACTIVE",
      "label": "Active"
    },
    {
      "value": "INACTIVE",
      "label": "Inactive"
    }
  ],
  "CollegeStatus": [
    {
      "value": "ACTIVE",
      "label": "Active"
    },
    {
      "value": "INACTIVE",
      "label": "Inactive"
    }
  ],
  "EmailStatus": [
    {
      "value": "PENDING",
      "label": "Pending"
    },
    {
      "value": "SENT",
      "label": "Sent"
    },
    {
      "value": "FAILED",
      "label": "Failed"
    }
  ],
  "PhaseStatus": [
    {
      "value": "UPCOMING",
      "label": "Upcoming"
    },
    {
      "value": "OPEN",
      "label": "Open"
    },
    {
      "value": "CLOSED",
      "label": "Closed"
    },
    {
      "value": "LOCKED",
      "label": "Locked"
    }
  ],
  "SubmissionStatus": [
    {
      "value": "DRAFT",
      "label": "Draft"
    },
    {
      "value": "SUBMITTED",
      "label": "Submitted"
    }
  ],
  "LinkType": [
    {
      "value": "REPOSITORY",
      "label": "Repository"
    },
    {
      "value": "DOCUMENTATION",
      "label": "Documentation"
    },
    {
      "value": "DEMO",
      "label": "Demo"
    },
    {
      "value": "PRESENTATION",
      "label": "Presentation"
    },
    {
      "value": "GOOGLE_DRIVE",
      "label": "Google Drive"
    },
    {
      "value": "GOOGLE_FORM",
      "label": "Google Form"
    },
    {
      "value": "VIDEO",
      "label": "Video"
    },
    {
      "value": "OTHER",
      "label": "Other"
    }
  ],
  "TeamRole": [
    {
      "value": "LEAD",
      "label": "Team Lead"
    },
    {
      "value": "MEMBER",
      "label": "Member"
    }
  ],
  "InviteStatus": [
    {
      "value": "PENDING",
      "label": "Pending"
    },
    {
      "value": "ACCEPTED",
      "label": "Accepted"
    },
    {
      "value": "DECLINED",
      "label": "Declined"
    },
    {
      "value": "CANCELLED",
      "label": "Cancelled"
    }
  ],
  "MentorStatus": [
    {
      "value": "PENDING",
      "label": "Pending"
    },
    {
      "value": "ACCEPTED",
      "label": "Accepted"
    },
    {
      "value": "REJECTED",
      "label": "Rejected"
    },
    {
      "value": "CANCELLED",
      "label": "Cancelled"
    },
    {
      "value": "REMOVED",
      "label": "Removed"
    }
  ],
  "EvaluatorSource": [
    {
      "value": "AUTO",
      "label": "Automatic"
    },
    {
      "value": "ADMIN_OVERRIDE",
      "label": "Set by Admin"
    }
  ],
  "EvaluationStatus": [
    {
      "value": "PENDING",
      "label": "Pending"
    },
    {
      "value": "SUBMITTED",
      "label": "Submitted"
    }
  ],
  "SubmissionProgress": [
    {
      "value": "PENDING",
      "label": "Pending"
    },
    {
      "value": "SUBMITTED",
      "label": "Submitted"
    }
  ],
  "EvaluationProgress": [
    {
      "value": "PENDING",
      "label": "Pending"
    },
    {
      "value": "COMPLETED",
      "label": "Completed"
    }
  ]
});

/** Value constants, e.g. PhaseStatus.OPEN === "OPEN" */
export const Role = Object.freeze({ SUPER_ADMIN: "SUPER_ADMIN", ADMIN: "ADMIN", FACULTY: "FACULTY", STUDENT: "STUDENT" });
export const AccountStatus = Object.freeze({ ACTIVE: "ACTIVE", INACTIVE: "INACTIVE" });
export const CollegeStatus = Object.freeze({ ACTIVE: "ACTIVE", INACTIVE: "INACTIVE" });
export const EmailStatus = Object.freeze({ PENDING: "PENDING", SENT: "SENT", FAILED: "FAILED" });
export const PhaseStatus = Object.freeze({ UPCOMING: "UPCOMING", OPEN: "OPEN", CLOSED: "CLOSED", LOCKED: "LOCKED" });
export const SubmissionStatus = Object.freeze({ DRAFT: "DRAFT", SUBMITTED: "SUBMITTED" });
export const LinkType = Object.freeze({ REPOSITORY: "REPOSITORY", DOCUMENTATION: "DOCUMENTATION", DEMO: "DEMO", PRESENTATION: "PRESENTATION", GOOGLE_DRIVE: "GOOGLE_DRIVE", GOOGLE_FORM: "GOOGLE_FORM", VIDEO: "VIDEO", OTHER: "OTHER" });
export const TeamRole = Object.freeze({ LEAD: "LEAD", MEMBER: "MEMBER" });
export const InviteStatus = Object.freeze({ PENDING: "PENDING", ACCEPTED: "ACCEPTED", DECLINED: "DECLINED", CANCELLED: "CANCELLED" });
export const MentorStatus = Object.freeze({ PENDING: "PENDING", ACCEPTED: "ACCEPTED", REJECTED: "REJECTED", CANCELLED: "CANCELLED", REMOVED: "REMOVED" });
export const EvaluatorSource = Object.freeze({ AUTO: "AUTO", ADMIN_OVERRIDE: "ADMIN_OVERRIDE" });
export const EvaluationStatus = Object.freeze({ PENDING: "PENDING", SUBMITTED: "SUBMITTED" });
export const SubmissionProgress = Object.freeze({ PENDING: "PENDING", SUBMITTED: "SUBMITTED" });
export const EvaluationProgress = Object.freeze({ PENDING: "PENDING", COMPLETED: "COMPLETED" });
