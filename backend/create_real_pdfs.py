import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT

def build_pdf(filename, title, content_paragraphs):
    os.makedirs("../data", exist_ok=True)
    filepath = os.path.join("../data", filename)
    doc = SimpleDocTemplate(filepath, pagesize=letter,
                            rightMargin=54, leftMargin=54,
                            topMargin=54, bottomMargin=54)
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        name='TitleStyle',
        parent=styles['Heading1'],
        alignment=TA_CENTER,
        fontSize=18,
        spaceAfter=15,
        textColor='#1e293b'
    )
    
    body_style = ParagraphStyle(
        name='BodyStyle',
        parent=styles['Normal'],
        alignment=TA_LEFT,
        fontSize=10,
        leading=15,
        textColor='#334155',
        spaceAfter=12
    )

    heading_style = ParagraphStyle(
        name='HeadingStyle',
        parent=styles['Heading2'],
        alignment=TA_LEFT,
        fontSize=12,
        leading=16,
        textColor='#1e3a8a',
        spaceBefore=10,
        spaceAfter=6
    )

    story = []
    
    # Title
    story.append(Paragraph(title, title_style))
    story.append(Spacer(1, 15))
    
    # Body Content
    for p_type, text in content_paragraphs:
        if p_type == 'heading':
            story.append(Paragraph(text, heading_style))
        else:
            story.append(Paragraph(text, body_style))
            
    doc.build(story)
    print(f"Generated valid PDF: {filepath}")

def main():
    # 1. DHL Contract Data
    dhl_content = [
        ('body', 'This Logistics Services Agreement (the "Agreement") is entered into by and between DHL Malaysia Logistics Services Ltd (hereinafter referred to as the "Supplier") and the Contracting Client.'),
        ('heading', 'Section 1: Scope of Services'),
        ('body', 'The Supplier shall provide comprehensive logistical transportation, warehousing, and shipment distribution services in Malaysia as requested by the Client.'),
        ('heading', 'Section 2: Term and Termination'),
        ('body', 'This Agreement shall commence on January 1, 2025, and remain in full force and effect until December 31, 2025, unless terminated earlier in accordance with the terms herein.'),
        ('heading', 'Section 3: Billing and Payments'),
        ('body', 'Invoices shall be generated monthly and are payable within thirty (30) days from the invoice date in USD or local currency conversion equivalents.'),
        ('heading', 'Section 4: Rebate Structure'),
        ('body', 'The Supplier agrees to pay a Volume-Based Rebate on all logistics purchases made in the calendar year of 2025.'),
        ('body', 'The rebates shall be calculated annually as a percentage of total shipment volume (quantity of units) as follows:'),
        ('body', '• From 0 to 5,000 units shipped: 1.0% rebate rate.'),
        ('body', '• From 5,001 to 20,000 units shipped: 2.5% rebate rate.'),
        ('body', '• From 20,001 units and above: 4.5% rebate rate.'),
        ('body', 'All rebate claims must be audited and verified against the Sales Register records by the end of Q1 2026. Decisions shall be based on verified container deliveries.')
    ]
    build_pdf(
        "Agreement DHL 2025 (1).pdf",
        "SUPPLIER SERVICES AGREEMENT - DHL 2025",
        dhl_content
    )

    # 2. Jun Ho Contract Data
    junho_content = [
        ('body', 'Bản thỏa thuận này được ký kết giữa Công ty Cổ phần Jun Ho Corp (sau đây gọi là "Bên B" hoặc "Nhà cung cấp") và Đối tác mua hàng (sau đây gọi là "Bên A").'),
        ('body', 'This Agreement is entered into between Jun Ho Corp (hereinafter referred to as "Supplier") and the Purchasing Client.'),
        ('heading', 'Điều 1: Quy định chung (Section 1: General Provisions)'),
        ('body', 'Bên B đồng ý cung cấp hàng hóa linh kiện điện tử chất lượng cao cho Bên A theo các đơn đặt hàng được gửi định kỳ hàng tháng.'),
        ('heading', 'Điều 3: Thanh toán và Tỷ giá (Section 3: Payments and Rates)'),
        ('body', 'Hóa đơn thanh toán bằng đồng USD. Thời hạn thanh toán là 15 ngày kể từ ngày nhận bàn giao chứng từ nhập khẩu.'),
        ('heading', 'Điều 6: Mức chiết khấu đạt được (Section 6: Rebate Tiers achieved)'),
        ('body', 'Tỷ lệ chiết khấu thương mại sẽ được tính dựa trên tổng giá trị mua hàng tích lũy (doanh thu tính bằng USD) trong năm tài khóa 2025:'),
        ('body', '• Dưới $50,000 USD (Under $50,000): Tỷ lệ chiết khấu đạt được là 0% (0.0% rate).'),
        ('body', '• Từ $50,000 USD đến $200,000 USD ($50,000 to $200,000): Tỷ lệ chiết khấu đạt được là 3.0% (3.0% rate).'),
        ('body', '• Trên $200,000 USD (Above $200,000): Tỷ lệ chiết khấu đạt được là 5.5% (5.5% rate).'),
        ('body', 'Citations: Tỷ lệ phần trăm chiết khấu quy định tại Điều 6 sẽ áp dụng cho toàn bộ doanh thu tích lũy được ghi nhận trong hệ thống kế toán giao dịch của Bên A.')
    ]
    build_pdf(
        "SG_Jun Ho 2025 (1).pdf",
        "BẢN THỎA THUẬN CHIẾT KHẤU THƯƠNG MẠI - JUN HO 2025",
        junho_content
    )

if __name__ == "__main__":
    main()
