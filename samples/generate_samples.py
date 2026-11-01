"""
Sample PDF Generator for Legal Contract Risk Analyzer.
Generates:
1. contract_risky_1.pdf (Multi-page: unlimited liability, hidden auto-renewal, one-sided termination)
2. contract_risky_2.pdf (Multi-page: broad IP assignment, unilateral price modifications, weak data privacy)
3. contract_scanned.pdf (Image-only / zero extractable text PDF to test OCR-out-of-scope 422 error)
"""

import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfgen import canvas

def build_pdf_with_canvas(filename, pages_content):
    """Build multi-page PDF where each page has specific text paragraphs."""
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        rightMargin=54,
        leftMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#0F172A'),
        spaceAfter=14
    )
    
    h2_style = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#1E293B'),
        spaceBefore=12,
        spaceAfter=6
    )
    
    body_style = ParagraphStyle(
        'LegalBody',
        parent=styles['Normal'],
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor('#334155'),
        spaceAfter=8
    )

    story = []
    for page_idx, page_paragraphs in enumerate(pages_content):
        if page_idx > 0:
            story.append(PageBreak())
        for item_type, text in page_paragraphs:
            if item_type == 'title':
                story.append(Paragraph(text, title_style))
            elif item_type == 'h2':
                story.append(Paragraph(text, h2_style))
            elif item_type == 'body':
                story.append(Paragraph(text, body_style))
            elif item_type == 'space':
                story.append(Spacer(1, text))

    doc.build(story)
    print(f"Generated: {filename}")

def generate_risky_contract_1(output_dir):
    """
    Contract 1:
    Page 1: Title, Recitals, Definitions (Hidden Auto-renewal in Definitions!)
    Page 2: Terms, Unlimited Liability, One-sided Termination
    Page 3: Indemnity, Warranties, Execution Block
    """
    filepath = os.path.join(output_dir, "contract_risky_1.pdf")
    pages = [
        # PAGE 1
        [
            ('title', 'MASTER SERVICES AGREEMENT'),
            ('body', 'This Master Services Agreement ("Agreement") is made and entered into as of October 15, 2026, by and between Apex Cloud Solutions LLC ("Vendor") and Global Enterprise Systems Inc. ("Customer").'),
            ('space', 10),
            ('h2', 'RECITALS'),
            ('body', 'WHEREAS, Vendor provides enterprise software hosting, deployment, and cloud infrastructure services; and WHEREAS, Customer desires to procure said services subject to the terms and stipulations set forth herein.'),
            ('space', 10),
            ('h2', 'SECTION 1. DEFINITIONS AND INITIAL TERMS'),
            ('body', '1.1 "Authorized Users" shall mean the employees, contractors, and designated agents of Customer permitted to access the cloud portal.'),
            ('body', '1.2 "Effective Date" shall mean the date of execution hereof.'),
            ('body', '1.3 "Renewal Period" shall mean that this Agreement shall automatically renew for successive terms of three (3) years unless Vendor terminates the contract at its sole option with sixty days written notice prior to term expiration.'),
            ('body', '1.4 "Customer Data" shall mean any digital assets, files, or information submitted by Customer into the Vendor systems.'),
            ('body', '1.5 "Service Specifications" shall mean the standard system capabilities described on Vendor publicly hosted website.')
        ],
        # PAGE 2
        [
            ('h2', 'SECTION 2. SERVICE FEES AND PAYMENT'),
            ('body', '2.1 Customer shall remit payments within ten (10) calendar days of invoice date. Vendor reserves the right to charge late interest of 3.5% per month compounded daily on overdue balances.'),
            ('body', '2.2 Vendor reserves the unilateral right to increase subscription fees at any time upon five (5) days email notification to Customer.'),
            ('space', 10),
            ('h2', 'SECTION 3. TERMINATION OF AGREEMENT'),
            ('body', '3.1 Vendor may terminate this Agreement at any time without cause or prior notice in its sole discretion, whereupon all pending fees for the full remaining term shall immediately become due and payable by Customer.'),
            ('body', '3.2 Customer may not terminate this Agreement for convenience under any circumstance prior to the completion of the full three-year term.'),
            ('space', 10),
            ('h2', 'SECTION 4. LIMITATION OF LIABILITY'),
            ('body', '4.1 Vendor liability shall be unlimited and Vendor shall not be subject to any aggregate cap on damages whatsoever under this Agreement or any applicable statement of work.'),
            ('body', '4.2 Customer aggregate liability for any claims or breaches shall not be limited and Customer waives all rights to assert consequential or punitive damage exclusions.')
        ],
        # PAGE 3
        [
            ('h2', 'SECTION 5. INDEMNIFICATION AND CLAIMS'),
            ('body', '5.1 Customer shall indemnify, defend, and hold harmless Vendor, its affiliates, directors, officers, and contractors against any and all claims, regulatory investigations, fines, and liabilities arising directly or indirectly from Customer use of the Services.'),
            ('body', '5.2 Vendor shall have no obligation to defend or indemnify Customer against any third-party claims alleging infringement of patents, copyrights, or trade secrets.'),
            ('space', 10),
            ('h2', 'SECTION 6. DISCLAIMER OF ALL WARRANTIES'),
            ('body', '6.1 The services are provided strictly AS-IS and AS-AVAILABLE without warranty of any kind, whether express, implied, or statutory, including warranties of merchantability, fitness for a particular purpose, or uninterrupted availability.'),
            ('space', 10),
            ('h2', 'SECTION 7. GOVERNING JURISDICTION'),
            ('body', '7.1 This Agreement shall be governed exclusively by the laws of the Cayman Islands, and Customer submits irrevocably to the exclusive jurisdiction of courts situated in George Town.'),
            ('space', 20),
            ('body', 'IN WITNESS WHEREOF, the parties hereto have executed this Master Services Agreement by their duly authorized representatives as of the date first written above.')
        ]
    ]
    build_pdf_with_canvas(filepath, pages)

def generate_risky_contract_2(output_dir):
    """
    Contract 2:
    Page 1: Title, IP Ownership (broad customer IP transfer to vendor)
    Page 2: Weak Data Protection, Disclaimers, Price alterations
    """
    filepath = os.path.join(output_dir, "contract_risky_2.pdf")
    pages = [
        # PAGE 1
        [
            ('title', 'VENDOR SOFTWARE PLATFORM AGREEMENT'),
            ('body', 'This Software Agreement is entered into by NextGen Analytics Corp ("Vendor") and Client Corp ("Customer").'),
            ('space', 10),
            ('h2', 'SECTION 1. INTELLECTUAL PROPERTY RIGHTS'),
            ('body', '1.1 Customer hereby assigns and transfers to Vendor all right, title, and interest in and to all data, custom workflows, models, and derivative intellectual property created or processed during the engagement.'),
            ('body', '1.2 Vendor shall retain irrevocable, royalty-free, perpetual worldwide rights to commercialize, resell, or distribute Customer proprietary workflows without accounting to Customer.'),
            ('space', 10),
            ('h2', 'SECTION 2. PRICING AND FEE MODIFICATIONS'),
            ('body', '2.1 Vendor may in its sole discretion modify fees, service levels, and operational terms at the start of any calendar quarter without Customer consent.')
        ],
        # PAGE 2
        [
            ('h2', 'SECTION 3. DATA SECURITY AND PRIVACY'),
            ('body', '3.1 Vendor does not warrant compliance with GDPR, HIPAA, or CCPA. Customer acknowledges that data is transmitted across public networks without end-to-end encryption.'),
            ('body', '3.2 In the event of a security breach or data exfiltration incident, Vendor shall notify Customer within ninety (90) business days, or whenever commercially convenient.'),
            ('space', 10),
            ('h2', 'SECTION 4. DISPUTE RESOLUTION'),
            ('body', '4.1 All claims arising hereunder must be resolved via mandatory non-appealable arbitration in Zurich, Switzerland under Swiss Chambers Arbitration Rules.')
        ]
    ]
    build_pdf_with_canvas(filepath, pages)

def generate_scanned_contract(output_dir):
    """
    Contract Scanned:
    Generates a PDF containing only graphical shapes/boxes and less than 50 characters of text,
    simulating a scanned document or pure image file without OCR text layer.
    """
    filepath = os.path.join(output_dir, "contract_scanned.pdf")
    c = canvas.Canvas(filepath, pagesize=letter)
    width, height = letter
    
    # Draw gray scanned border and simulated image rectangle
    c.setStrokeColor(colors.gray)
    c.rect(36, 36, width - 72, height - 72, fill=0)
    c.setFillColor(colors.lightgrey)
    c.rect(50, 100, width - 100, height - 200, fill=1)
    
    # Very brief stamp text (< 50 chars, well below the 200 char threshold)
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(72, height - 80, "SCANNED IMAGE ONLY - NO OCR TEXT")
    
    c.showPage()
    c.save()
    print(f"Generated: {filepath}")

def main():
    output_dir = os.path.dirname(os.path.abspath(__file__))
    generate_risky_contract_1(output_dir)
    generate_risky_contract_2(output_dir)
    generate_scanned_contract(output_dir)
    print("All sample contracts generated successfully!")

if __name__ == '__main__':
    main()

