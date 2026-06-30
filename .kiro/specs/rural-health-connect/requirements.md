# Requirements Document

## Introduction

RuralHealthConnect is a mobile application designed to bridge the healthcare gap in rural and remote areas by connecting patients with qualified doctors through an asynchronous teleconsultation model. A patient describes their illness in text, the app matches and forwards the request to nearby specialist doctors, a doctor accepts and provides a treatment plan, and the patient pays a fee to unlock and view the doctor's advice. The system maintains a geographically-aware database of doctors covering rural areas to ensure relevant, accessible care.

---

## Glossary

- **Patient**: A registered user seeking medical consultation through the application.
- **Doctor**: A registered, verified medical professional listed in the system who can accept consultation requests.
- **Consultation_Request**: A structured record created by a Patient containing an illness description, submitted for matching and forwarding to Doctors.
- **Treatment_Plan**: A structured document created by a Doctor in response to a Consultation_Request, containing diagnosis, recommended cure, and/or medication.
- **Matcher**: The system component responsible for identifying and ranking Doctors based on specialization and geographic proximity to the Patient.
- **Payment_Gateway**: The external payment processing service integrated into the application.
- **Doctor_Database**: The persistent store of verified Doctor profiles, including specializations and geographic service areas.
- **Notification_Service**: The system component responsible for delivering push notifications and alerts to Patients and Doctors.
- **Paywall**: The access control mechanism that restricts a Patient from viewing a Treatment_Plan until payment is confirmed.
- **Rural_Zone**: A geographic area classified as rural or semi-urban, defined by a stored boundary polygon in the application's region configuration.
- **Specialization**: A medical specialty or area of expertise associated with a Doctor profile (e.g., General Practice, Dermatology, Pediatrics).
- **Prescription_Video**: An optional short video (MP4 or MOV format, maximum 2 minutes duration and 100 MB file size) recorded or uploaded by a Doctor to explain their diagnosis and treatment plan. The Prescription_Video is attached to a Treatment_Plan before submission, stored in cloud object storage, and its access URL is gated behind the Paywall alongside the Treatment_Plan content.

---

## Requirements

### Requirement 1: Patient Registration and Onboarding

**User Story:** As a patient in a rural area, I want to register and set up my profile, so that I can access medical consultations through the application.

#### Acceptance Criteria

1. THE Patient_Registration_Module SHALL collect the patient's full name (2–100 characters), phone number (E.164 format), date of birth (past date), gender (one of: Male, Female, Other, Prefer not to say), and geographic location (latitude/longitude) during registration.
2. WHEN a patient submits a registration form with all mandatory fields present and correctly formatted, THE Patient_Registration_Module SHALL validate the fields and create the account in a single atomic step.
3. WHEN a patient provides a phone number, THE Patient_Registration_Module SHALL send a 6-digit OTP to that number and require the patient to enter the correct OTP within 10 minutes and 3 attempts before activating the account.
4. IF a patient enters an incorrect OTP or the OTP expires, THEN THE Patient_Registration_Module SHALL display an error message specifying whether the failure was due to an incorrect code or expiry, and SHALL allow the patient to request a new OTP.
5. IF a phone number is already associated with an existing account, THEN THE Patient_Registration_Module SHALL reject the registration and display an error message stating that the phone number is already in use.
6. WHEN a patient successfully completes registration and OTP verification, THE Patient_Registration_Module SHALL create a Patient profile and redirect the patient to the home screen.

---

### Requirement 2: Doctor Registration and Profile Management

**User Story:** As a doctor serving rural communities, I want to register and maintain my professional profile, so that I can be discoverable by patients who need my expertise.

#### Acceptance Criteria

1. WHEN a doctor submits a registration form, THE Doctor_Registration_Module SHALL collect the doctor's full name (2–100 characters), phone number (E.164 format), medical license number (alphanumeric, 6–20 characters), at least one Specialization, and geographic service area (named region with an optional radius in kilometers).
2. WHEN a doctor submits a registration form and the medical license number matches the alphanumeric format (6–20 characters) and is not already registered, THE Doctor_Registration_Module SHALL automatically activate the doctor's profile and make them available for consultation matching.
3. IF a medical license number fails format validation or is a duplicate of an existing license, THEN THE Doctor_Registration_Module SHALL prevent account activation, mark the account as pending review, and notify the platform administrator with the reason for failure.
3a. WHERE a valid medical license requires additional manual verification beyond automated validation, THE Doctor_Registration_Module SHALL mark the account as pending review until verification is complete.
4. IF a doctor submits the registration form with missing required fields or fields failing format validation, THEN THE Doctor_Registration_Module SHALL highlight each invalid field and display a descriptive error message per field without discarding entered content.
5. WHEN a doctor's profile is approved, THE Doctor_Database SHALL store the doctor's profile with associated Specializations and geographic service area coordinates.
6. WHEN a doctor updates their availability status, THE Doctor_Database SHALL reflect the updated availability within 30 seconds.
7. WHERE a doctor chooses to specify multiple Specializations, THE Doctor_Registration_Module SHALL allow associating up to 5 Specializations with a single Doctor profile.

---

### Requirement 3: Doctor Database with Rural Area Coverage

**User Story:** As the platform, I want to maintain a database of doctors covering rural and semi-urban zones, so that patients in underserved areas can always find relevant nearby doctors.

#### Acceptance Criteria

1. THE Doctor_Database SHALL store each Doctor's geographic service area as a center coordinate (latitude/longitude) and a scalar coverage radius expressed in kilometers.
2. THE Doctor_Database SHALL support querying Doctors by Specialization and by geographic proximity to a given set of coordinates, and SHALL return results within 500 milliseconds for datasets up to 100,000 Doctor profiles.
3. WHEN a Doctor profile is added or updated, THE Doctor_Database SHALL index the profile by Specialization and geographic coverage within 5 seconds to enable efficient lookup.
4. IF a Doctor's primary service area center coordinate falls within a stored Rural_Zone boundary polygon, THEN THE Doctor_Database SHALL tag that Doctor profile with the corresponding Rural_Zone classification.
5. WHEN the Doctor_Database is queried for a Rural_Zone location, THE Doctor_Database SHALL return only Doctors whose coverage area overlaps that Rural_Zone. WHERE indexing errors or stale data cause non-overlapping Doctors to be included in query results, THE Application SHALL apply geographic filtering at the application layer to remove non-overlapping results before presenting them to the user.

---

### Requirement 4: Illness Description and Consultation Request Submission

**User Story:** As a patient, I want to describe my illness in text and submit a consultation request, so that a relevant doctor can review my condition and provide advice.

#### Acceptance Criteria

1. THE Consultation_Request_Module SHALL provide a text input field accepting a minimum of 20 characters and a maximum of 2000 characters for the illness description.
2. WHEN a patient submits an illness description and geographic coordinates are available on the device, THE Consultation_Request_Module SHALL create a Consultation_Request record containing the illness description, patient identifier, submission timestamp, and patient's current geographic coordinates.
3. IF geographic coordinates are unavailable at submission time, THEN THE Consultation_Request_Module SHALL display an error message asking the patient to enable location services before submitting.
4. WHEN a Consultation_Request is created, THE Consultation_Request_Module SHALL assign it a UUID and set its status to `PENDING`.
5. IF a patient has an existing Consultation_Request with status `PENDING` or `ACCEPTED`, THEN THE Consultation_Request_Module SHALL prevent submission of a new Consultation_Request and display a message indicating the status of the active request.
6. WHERE a patient optionally attaches supporting information (such as symptom duration or prior medications), THE Consultation_Request_Module SHALL accept up to 500 characters of additional context and store it alongside the illness description.

---

### Requirement 5: Doctor Matching and Request Forwarding

**User Story:** As a patient, I want my consultation request to be forwarded to doctors who specialize in my condition and are nearby, so that I receive relevant and accessible medical advice.

#### Acceptance Criteria

1. WHEN a Consultation_Request is created, THE Matcher SHALL identify candidate Doctors whose registered Specialization tags match keywords extracted from the illness description and whose service area includes the patient's geographic coordinates, using an initial search radius of 50 kilometers.
2. WHEN the Matcher identifies candidate Doctors, THE Matcher SHALL rank them in ascending order of geographic distance from the patient's location. For this ranking, "available" means the Doctor has `ACTIVE` status and has not accepted another Consultation_Request in the past 24 hours.
3. WHEN the Matcher produces a ranked list of at least one candidate Doctor, THE Notification_Service SHALL forward the Consultation_Request to the top 10 ranked available Doctors within 60 seconds of the Consultation_Request creation timestamp. WHEN no candidate Doctors are found, THE Matcher SHALL skip forwarding entirely.
4. IF fewer than 10 candidate Doctors are available, THEN THE Matcher SHALL forward the request to all available candidate Doctors.
5. IF no candidate Doctors are found within the current search radius, THEN THE Matcher SHALL expand the search radius by 50 kilometers and repeat the matching process up to 3 times before exhausting all expansions.
6. WHEN the Matcher exhausts all search radius expansions without finding a candidate Doctor, THE Consultation_Request_Module SHALL notify the Patient that no matching doctors are currently available and set the request status to `UNMATCHED`.

---

### Requirement 6: Doctor Notification and Request Acceptance

**User Story:** As a doctor, I want to receive notifications about consultation requests matching my specialization, so that I can review and accept cases I can help with.

#### Acceptance Criteria

1. WHEN a Consultation_Request is forwarded to a Doctor, THE Notification_Service SHALL deliver a push notification to the Doctor's device containing the first 200 characters of the patient's illness description and the request identifier. IF delivery is delayed due to network or server conditions, THE Notification_Service SHALL continue retrying and deliver the notification when connectivity is restored.
2. WHEN a Doctor opens a forwarded Consultation_Request, THE Consultation_Request_Module SHALL display the full illness description, submission timestamp, and the patient's administrative district or county (without revealing the patient's precise address or coordinates).
3. WHEN a Doctor accepts a Consultation_Request, THE Consultation_Request_Module SHALL set the request status to `ACCEPTED`, record the accepting Doctor's identifier and acceptance timestamp, and attempt to notify the Patient via the Notification_Service. IF patient notification fails due to network or device issues, THE Consultation_Request_Module SHALL retain the `ACCEPTED` status and consider the acceptance valid.
4. IF a second Doctor attempts to accept a Consultation_Request that has already reached `ACCEPTED` status, THEN THE Consultation_Request_Module SHALL reject the second acceptance attempt and return an error indicating the request is no longer available.
5. IF a Doctor does not respond to a forwarded Consultation_Request within 24 hours, THEN THE Consultation_Request_Module SHALL mark that forwarding as expired for that Doctor, remove the request from the Doctor's active queue, and re-forward the request to the next available ranked candidate Doctor if the request has not yet reached `ACCEPTED` status.
6. WHEN a Consultation_Request reaches `ACCEPTED` status, THE Notification_Service SHALL stop forwarding that request to other Doctors and cancel any pending notifications for that request.

---

### Requirement 7: Treatment Plan Creation by Doctor

**User Story:** As a doctor, I want to write and submit a treatment plan for an accepted consultation request, so that the patient receives actionable medical advice.

#### Acceptance Criteria

1. WHEN a Doctor has accepted a Consultation_Request, THE Treatment_Plan_Module SHALL provide the Doctor with a structured form to enter a diagnosis summary (up to 2000 characters), up to 20 recommended treatment steps (up to 500 characters each), and optional medication names with dosages (up to 100 characters per entry).
2. WHEN a Doctor submits a Treatment_Plan, THE Treatment_Plan_Module SHALL validate that the diagnosis summary contains at least 50 characters and at least one treatment step is present before accepting the submission.
3. IF a Doctor submits a Treatment_Plan with a missing or invalid diagnosis summary or no treatment steps, THEN THE Treatment_Plan_Module SHALL highlight the incomplete fields and display descriptive error messages without discarding entered content. The Consultation_Request status SHALL remain unchanged when submission fails validation.
4. THE Treatment_Plan_Module SHALL require that a Doctor has formally accepted a Consultation_Request before allowing a Treatment_Plan submission for that request. IF a Doctor attempts to submit a Treatment_Plan for a request they have not accepted, THE Treatment_Plan_Module SHALL reject the submission with a descriptive error.
5. WHEN a Treatment_Plan is successfully submitted, THE Treatment_Plan_Module SHALL associate it with the corresponding Consultation_Request, set the request status to `TREATMENT_READY`, trigger the Paywall for the Patient, and mark the Treatment_Plan record as immutable so that no further edits are permitted.
6. WHEN a Treatment_Plan is submitted, THE Notification_Service SHALL attempt to deliver a push notification to the Patient indicating that a treatment plan is ready for viewing. IF notification delivery fails, THE Notification_Service SHALL retry delivery until successful or until 3 retry attempts are exhausted.
7. WHEN a Doctor submits a Treatment_Plan, THE Treatment_Plan_Module SHALL record the submission timestamp (UTC) and the Doctor's identifier within the Treatment_Plan record.

---

### Requirement 8: Paywall and Payment Flow

**User Story:** As a patient, I want to pay a fee to unlock the doctor's treatment plan, so that I can view the medical advice provided for my consultation request.

#### Acceptance Criteria

1. WHEN a Consultation_Request status is `TREATMENT_READY`, THE Paywall SHALL present the Patient with a payment prompt displaying the consultation fee amount and currency before revealing any content of the Treatment_Plan.
2. WHEN a Patient initiates payment, THE Payment_Gateway SHALL process the transaction and return a success or failure status to the application within 30 seconds. IF the Payment_Gateway is unavailable or does not respond within 30 seconds, THE Paywall SHALL display a timeout error and allow the Patient to retry, without treating the timeout as a payment failure.
3. WHEN the Payment_Gateway confirms a successful transaction, THE Paywall SHALL unlock the Treatment_Plan and make all its fields (diagnosis summary, treatment steps, medications) fully visible to the Patient.
4. IF the Payment_Gateway returns a failure status, THEN THE Paywall SHALL display a descriptive payment failure message and allow the Patient to retry up to 3 times without re-submitting the Consultation_Request.
5. WHEN a Patient's payment is confirmed, THE Payment_Gateway SHALL generate a payment receipt containing the transaction identifier, amount, currency, timestamp, and consultation request identifier. IF receipt generation fails, THE Payment_Gateway SHALL retry generation until the receipt is successfully produced before delivering it to the Patient.
6. WHEN a treatment plan is unlocked, THE Paywall SHALL keep it permanently accessible to that Patient for that Consultation_Request without requiring additional payment, except in circumstances where the Patient's account is deleted or suspended, in which case the Application MAY revoke access in accordance with the account deletion policy.
7. THE Payment_Gateway SHALL support at least two payment methods appropriate for rural populations, such as mobile money and UPI or equivalent local payment services.

---

### Requirement 9: Patient Consultation History

**User Story:** As a patient, I want to view my past consultation requests and unlocked treatment plans, so that I can reference previous medical advice.

#### Acceptance Criteria

1. THE Consultation_History_Module SHALL maintain a record of all Consultation_Requests submitted by a Patient, including their status and associated Treatment_Plans where payment has been confirmed.
2. WHEN a Patient navigates to their consultation history, THE Consultation_History_Module SHALL display all past Consultation_Requests in reverse chronological order, showing the illness description summary (first 100 characters), submission date, and current status per item.
3. WHEN a Patient selects a past Consultation_Request for which payment has been confirmed, THE Consultation_History_Module SHALL display the full Treatment_Plan including the diagnosis summary, all treatment steps, medications with dosages, and the Doctor's submission timestamp.
4. WHEN a Patient selects a past Consultation_Request for which payment has not been confirmed, THE Consultation_History_Module SHALL display the Paywall for that request.

---

### Requirement 10: Doctor's Consultation Queue Management

**User Story:** As a doctor, I want to manage my active and past consultations, so that I can track the requests I have accepted and the treatment plans I have submitted.

#### Acceptance Criteria

1. THE Doctor_Dashboard_Module SHALL display a list of all Consultation_Requests forwarded to the Doctor, segmented by status: pending acceptance (showing illness description summary and forwarding timestamp), accepted, and treatment submitted.
2. WHEN a Doctor views the accepted consultations list, THE Doctor_Dashboard_Module SHALL present each accepted Consultation_Request with the illness description, acceptance timestamp, and current status.
3. WHEN a Doctor has submitted a Treatment_Plan for a Consultation_Request, THE Doctor_Dashboard_Module SHALL mark that request as `COMPLETED` in the Doctor's queue.
4. WHILE a Doctor is actively viewing a Consultation_Request detail screen, THE Doctor_Dashboard_Module SHALL keep the request visible in the Doctor's queue. WHEN the Doctor navigates away from the detail screen without submitting a Treatment_Plan, THE Doctor_Dashboard_Module SHALL retain the request in the queue until it expires or a Treatment_Plan is submitted.

---

### Requirement 11: Privacy and Data Security

**User Story:** As a patient, I want my personal health information to be kept private and secure, so that my medical details are not disclosed to unauthorized parties.

#### Acceptance Criteria

1. THE Application SHALL encrypt all Treatment_Plan data at rest using AES-256 or an equivalent algorithm meeting NIST SP 800-131A Rev. 2 minimum standards.
2. THE Application SHALL transmit all patient health data between the client and server using TLS 1.2 or higher.
3. WHEN a Doctor views a Consultation_Request, THE Application SHALL display only the patient's administrative district or county and illness description, and SHALL NOT expose the patient's full name, phone number, precise coordinates, or date of birth to the Doctor.
4. WHEN a Patient's account is deleted, THE Application SHALL anonymize all associated Consultation_Request records by removing the patient's full name, phone number, date of birth, precise coordinates, and account identifier, and SHALL permanently delete all personally identifiable information within 30 days. IF PII deletion fails while anonymization succeeds, THE Application SHALL retry PII deletion until both operations complete successfully.
5. THE Application SHALL enforce role-based access control, ensuring that a Patient account cannot access another Patient's Consultation_Request or Treatment_Plan records, and SHALL return an access-denied response without displaying any of the requested Patient's information when access is denied.

---

### Requirement 12: Video Prescription

**User Story:** As a doctor, I want to record or upload a short video explaining my prescription and treatment plan before submitting it, so that patients in rural areas can better understand their diagnosis and recommended care even with limited health literacy.

#### Acceptance Criteria

1. WHEN a Doctor is composing a Treatment_Plan for an accepted Consultation_Request, THE Treatment_Plan_Module SHALL provide the option to record a new video using the device camera or upload an existing video file from the device storage. This video attachment is optional and SHALL NOT be required for Treatment_Plan submission.
2. WHEN a Doctor selects a video file for upload, THE Treatment_Plan_Module SHALL accept only files in MP4 or MOV format. IF a file in any other format is selected, THEN THE Treatment_Plan_Module SHALL reject the file and display an error message specifying the accepted formats.
3. WHEN a Doctor selects or records a Prescription_Video, THE Treatment_Plan_Module SHALL enforce a maximum file size of 100 MB and a maximum duration of 2 minutes. IF the selected video exceeds either limit, THEN THE Treatment_Plan_Module SHALL reject the video and display a descriptive error message stating the specific limit exceeded.
4. WHEN a Doctor initiates a Prescription_Video upload, THE Treatment_Plan_Module SHALL upload the video to cloud object storage (such as AWS S3 or equivalent) over a secure HTTPS connection and SHALL display upload progress to the Doctor. IF the upload fails due to a network error, THE Treatment_Plan_Module SHALL allow the Doctor to retry the upload without re-entering other Treatment_Plan fields.
5. WHEN a Prescription_Video upload completes successfully, THE Treatment_Plan_Module SHALL store the video's secure access URL in the TREATMENT_PLANS table record for that Consultation_Request and SHALL require that this upload is fully complete before enabling the Treatment_Plan submission action.
6. WHILE a Prescription_Video upload is in progress, THE Treatment_Plan_Module SHALL disable the Treatment_Plan submission control and display a status indicator informing the Doctor that upload must complete before submission.
7. WHEN a Treatment_Plan containing a Prescription_Video is submitted, THE Paywall SHALL gate access to the Prescription_Video URL using the same payment confirmation requirement as the rest of the Treatment_Plan content. A Patient SHALL NOT be able to access or retrieve the Prescription_Video URL before payment is confirmed.
8. WHEN a Patient's payment for a Consultation_Request is confirmed, THE Paywall SHALL make the Prescription_Video URL accessible to that Patient alongside the other Treatment_Plan fields, allowing the Patient to stream or download the video.
9. WHEN a Prescription_Video is stored in cloud object storage, THE Application SHALL apply access controls ensuring the video object is not publicly accessible and can only be retrieved via a time-limited signed URL generated by the server upon a verified, authenticated, and payment-confirmed request from the Patient.
10. WHEN a Doctor has not attached a Prescription_Video to a Treatment_Plan before submission, THE Treatment_Plan_Module SHALL store a null value for the video URL field in the TREATMENT_PLANS table and SHALL NOT require or prompt for a video on subsequent views of that Treatment_Plan.
