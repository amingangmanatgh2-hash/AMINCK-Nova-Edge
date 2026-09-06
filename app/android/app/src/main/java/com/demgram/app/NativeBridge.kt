package com.demgram.app

import android.content.ContentResolver
import android.content.Context
import android.database.Cursor
import android.provider.ContactsContract
import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject

class NativeBridge(private val context: Context) {

    @JavascriptInterface
    fun getPhoneContacts(filter: String): String {
        // Returns phone contacts as JSON for DemGram smart add
        val contacts = JSONArray()
        try {
            val resolver: ContentResolver = context.contentResolver
            val cursor: Cursor? = resolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                arrayOf(
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                    ContactsContract.CommonDataKinds.Phone.NUMBER,
                    ContactsContract.CommonDataKinds.Phone.CONTACT_ID
                ),
                null, null, null
            )
            cursor?.use {
                var count = 0
                while (it.moveToNext() && count < 500) {
                    val name = it.getString(0) ?: ""
                    val phone = it.getString(1) ?: ""
                    val id = it.getString(2) ?: ""
                    if (filter.isNotEmpty() && !name.contains(filter, true) && !phone.contains(filter)) continue
                    val obj = JSONObject()
                    obj.put("id", id)
                    obj.put("first_name", name)
                    obj.put("phone", phone)
                    obj.put("username", "")
                    contacts.put(obj)
                    count++
                }
            }
        } catch (e: Exception) {
            // ignore
        }
        return contacts.toString()
    }

    @JavascriptInterface
    fun showToast(msg: String) {
        android.widget.Toast.makeText(context, msg, android.widget.Toast.LENGTH_SHORT).show()
    }

    @JavascriptInterface
    fun getVersion(): String = "2.1-goulakh DemGram - 1000 قابلیت"

    @JavascriptInterface
    fun exportSession(sessionJson: String): String {
        // Save session to file securely
        return try {
            val file = java.io.File(context.filesDir, "demgram-session.json")
            file.writeText(sessionJson)
            "saved:${file.absolutePath}"
        } catch (e: Exception) {
            "error:${e.message}"
        }
    }
}
