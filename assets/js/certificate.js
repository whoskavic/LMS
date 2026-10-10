// Sertifikat kelulusan course — digambar di <canvas> lalu diunduh sebagai PNG (tanpa library)

const Certificate = {
  WIDTH: 1600,
  HEIGHT: 1130,

  // Gambar sertifikat dari enrollment (bentuk respons API: { course, certificate, grade }) untuk student; mengembalikan canvas.
  // Nomor sertifikat dibuat & disimpan server (acak, bisa diverifikasi).
  async draw(enrollment, student) {
    const course = enrollment?.course;
    const cert = enrollment?.certificate;
    if (!course || !student || !cert) return null;
    if (document.fonts) await document.fonts.ready;

    const { WIDTH: w, HEIGHT: h } = this;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const font = (weight, size) => `${weight} ${size}px Inter, "Segoe UI", Arial, sans-serif`;
    const text = (value, y, weight, size, color, x = w / 2, align = "center") => {
      ctx.font = font(weight, size);
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.fillText(value, x, y);
    };
    // Perkecil ukuran huruf bila teks terlalu panjang
    const fit = (value, weight, size, maxWidth) => {
      ctx.font = font(weight, size);
      while (size > 24 && ctx.measureText(value).width > maxWidth) ctx.font = font(weight, (size -= 2));
      return size;
    };

    // Latar & bingkai
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = course.color || "#c7d2fe";
    ctx.fillRect(0, 0, w, 24);
    ctx.fillRect(0, h - 24, w, 24);
    ctx.strokeStyle = "#4f46e5";
    ctx.lineWidth = 4;
    ctx.strokeRect(60, 70, w - 120, h - 140);
    ctx.strokeStyle = "#c7d2fe";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(76, 86, w - 152, h - 172);

    // Isi
    text("LEARNOVA LMS", 200, 700, 26, "#4f46e5");
    text("Certificate of Completion", 290, 700, 64, "#111827");
    text("This certificate is proudly presented to", 380, 400, 26, "#6b7280");
    text(student.name, 480, 700, fit(student.name, 700, 72, w - 360), "#312e81");
    ctx.fillStyle = "#4f46e5";
    ctx.fillRect(w / 2 - 260, 512, 520, 3);
    if (student.idNumber) text(`NIM ${student.idNumber}`, 560, 400, 22, "#6b7280");
    text("for successfully completing all modules of the course", 640, 400, 26, "#6b7280");
    const title = course.code ? `${course.code} · ${course.title}` : course.title;
    text(title, 715, 700, fit(title, 700, 42, w - 360), "#111827");
    const meta = [course.semester, course.duration ? `${course.duration} weeks` : "", enrollment.grade ? `Final grade ${enrollment.grade}` : ""].filter(Boolean);
    text(meta.join(" · "), 770, 400, 24, "#6b7280");

    // Tanda tangan & tanggal
    const footerY = 930;
    [
      [w / 2 - 380, Utils.formatDate(cert.date, false), "Date of completion"],
      [w / 2 + 380, course.instructorName, "Course instructor"],
    ].forEach(([x, value, label]) => {
      text(value, footerY - 20, 600, 26, "#111827", x);
      ctx.fillStyle = "#d1d5db";
      ctx.fillRect(x - 170, footerY, 340, 2);
      text(label, footerY + 36, 400, 20, "#6b7280", x);
    });
    text(`Certificate no. ${cert.number} · verify at ${location.origin}${location.pathname.replace(/pages\/[^/]*$/, "")}verify.html`, h - 110, 400, 18, "#9ca3af");
    return canvas;
  },

  async download(enrollment, student = App.user) {
    const canvas = await this.draw(enrollment, student);
    if (!canvas) return UI.toast("Certificate is not available for this course yet.", "error");
    const { number } = enrollment.certificate;
    const link = document.createElement("a");
    link.download = `${number.toLowerCase()}-certificate.png`;
    link.href = canvas.toDataURL("image/png");
    document.body.append(link);
    link.click();
    link.remove();
    UI.toast("Certificate downloaded.");
  },
};
