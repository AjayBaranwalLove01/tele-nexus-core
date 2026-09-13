# Remix of LeadFlow Pro Janesh OxO

Enterprise Telecalling CRM & Lead Distribution System

Project Overview

Build a modern, responsive, enterprise-grade Lead Management CRM for telecalling operations.

The system should support:

Large-scale lead imports (1 lakh to 5 lakh+ leads per upload)

Admin and Telecaller roles

Automated lead distribution

Follow-up management

Mobile calling

WhatsApp integration

Real-time lead allocation

High-performance database architecture

The application must be fully responsive and optimized for:

Desktop

Tablet

Mobile Devices

User Roles

Admin

Admin can:

Create/Edit/Delete Telecallers

Activate/Deactivate Telecallers

Import leads from Excel/CSV

Add leads manually

Assign/Reassign leads

Recall unused leads

Configure lead distribution rules

Manage statuses

Manage lead temperatures

View all leads

View all follow-ups

Export reports

Monitor telecaller performance

Telecaller

Telecaller can:

Login securely

View assigned leads only

Update lead status

Update lead temperature

Add remarks

Schedule follow-ups

Call customers directly

Open WhatsApp chats

Request next batch of leads

Lead Import Module

Supported Formats

Excel (.xlsx)

CSV

Excel Structure

Only two columns:

| Name | Phone Number |

Both fields must be optional.

Examples:

NamePhone NumberRahul Sharma9876543210Amit Kumar9988776655

System should import records even if:

Name is blank

Phone number is blank

Large Scale Import Support

This is a critical requirement.

The system must support importing:

100,000 leads

200,000 leads

500,000 leads

Future support for 1,000,000+ leads

Requirements:

Background processing

Queue-based import

Chunked uploads

Import progress bar

Import logs

Duplicate checking

Failed records report

The application must never freeze during large imports.

Lead Pool System

After import, all leads must first enter a central:

"Unassigned Lead Pool"

Example:

Imported Leads: 100,000

Assigned Leads: 0

Unassigned Leads: 100,000

Lead Fields

Each lead should contain:

Lead ID

Name (Nullable)

Phone Number (Nullable)

Assigned Telecaller

Status

Temperature

Next Follow-Up Date

Follow-Up Time

Remarks

Created Date

Updated Date

Lead Status

Default statuses:

New

Contacted

Follow Up

Callback

Interested

Not Interested

Converted

Closed

Admin can manage statuses.

Lead Temperature

Default values:

Hot

Warm

Cold

Admin can manage temperatures.

Automated Lead Distribution Engine

Leads Per Telecaller

Admin can define:

25 Leads

50 Leads

100 Leads

Custom Number

Example:

Admin imports 100,000 leads.

There are 100 telecallers.

Admin sets:

50 Leads Per Telecaller

System automatically assigns:

Telecaller 1 → 50 leads

Telecaller 2 → 50 leads

Telecaller 3 → 50 leads

Total Assigned:

5,000 Leads

Remaining:

95,000 Leads stay in Unassigned Lead Pool.

Lead Quota System

Each telecaller should have:

Assigned Leads Count

Completed Leads Count

Remaining Leads Count

Example:

Quota = 50

Telecaller receives 50 leads.

Lead Completion Rules

A lead is considered completed when status becomes:

Converted

Not Interested

Closed

Admin can configure additional completion statuses.

Completed leads should not count toward active quota.

Get More Leads Feature

This is a critical feature.

When a telecaller completes all assigned leads:

Display button:

"Get More Leads"

Upon clicking:

System automatically assigns the next available batch.

Example:

Quota = 50

Telecaller completes all 50 leads.

Clicks:

"Get More Leads"

System instantly assigns next 50 leads from Unassigned Lead Pool.

No admin approval required.

Auto Refill Mode

Admin can enable:

"Auto Refill Leads"

If enabled:

When telecaller reaches zero active leads:

System automatically assigns next batch.

Example:

Quota = 50

Telecaller finishes all 50.

System immediately assigns another 50.

Lead Reservation System

This is mandatory.

Prevent duplicate assignment.

If multiple telecallers request leads simultaneously:

Each lead can only be assigned once.

Database transactions must ensure atomic allocation.

No lead can ever be assigned to two telecallers.

Lead Recall / Take Back Feature

Admin should be able to reclaim unused leads.

Example:

Telecaller assigned: 50 leads

Worked on: 10

Unused: 40

Admin clicks:

"Recall Unused Leads"

System returns 40 unused leads to Unassigned Lead Pool.

Unused Lead Definition

Unused means:

No remarks

No follow-up date

No call activity

Status remains New

Only unused leads can be recalled automatically.

Follow-Up Management (Highest Priority Module)

Every lead must support:

Next Follow-Up Date

Follow-Up Time

Follow-Up Queue

Whenever a user logs in:

Leads must always appear in this order:

Overdue Follow-Ups

Today's Follow-Ups

Tomorrow's Follow-Ups

Future Follow-Ups

Leads Without Follow-Up Date

This ordering must be applied throughout the application.

My Follow-Up Queue

Telecaller dashboard must display:

"My Follow-Up Queue"

Always at the top.

Show:

Lead Name

Phone Number

Follow-Up Date

Status

Temperature

Call Button

WhatsApp Button

Follow-Up Indicators

Overdue:

Red Badge

Due Today:

Orange Badge

Due Tomorrow:

Blue Badge

Completed:

Green Badge

Follow-Up Workflow

Telecaller can:

Add Remark

Update Status

Update Temperature

Set Next Follow-Up Date

Lead should automatically move within the queue based on the next follow-up date.

Mobile Calling

When CRM is opened on mobile:

Show:

☎ Call Now

Clicking should launch:

tel:+919876543210

One-click dialer opening.

WhatsApp Integration

Show WhatsApp button beside every phone number.

Clicking opens:

https://wa.me/phonenumber

Support:

Direct chat

Quick templates

Remarks & Activity Timeline

Unlimited remarks per lead.

Store:

User

Date

Time

Remark

Display chronological timeline.

Search & Filters

Global search:

Name

Phone Number

Filters:

Status

Temperature

Telecaller

Follow-Up Date

Dashboards

Admin Dashboard

Show:

Total Imported Leads

Assigned Leads

Unassigned Leads

Recalled Leads

Converted Leads

Total Telecallers

Overdue Follow-Ups

Today's Follow-Ups

Tomorrow's Follow-Ups

Charts:

Lead Status Distribution

Lead Temperature Distribution

Conversion Trends

Telecaller Performance

Telecaller Dashboard

Show:

Assigned Leads

Remaining Leads

Completed Leads

Hot Leads

Overdue Follow-Ups

Today's Follow-Ups

The first visible section must always be:

"My Follow-Up Queue"

Reports

Export:

Excel

CSV

PDF

Reports:

Lead Report

Follow-Up Report

Telecaller Performance

Conversion Report

Assignment History Report

Audit Logs

Track:

Lead Imports

Lead Assignments

Lead Reassignments

Lead Recalls

Status Changes

Follow-Up Updates

Security

Role-Based Access Control

Secure Authentication

Password Reset

Session Management

Audit Trail

Performance Requirements

The application must comfortably support:

100+ Telecallers

100,000 to 500,000 leads imported in a single upload

Fast searching

Fast lead assignment

Fast follow-up retrieval

Use optimized database indexing on:

Phone Number

Status

Follow-Up Date

Assigned Telecaller

Lead Temperature

Build the application with an enterprise-grade architecture capable of scaling to millions of leads in the future.

UI Requirements

Design quality should be comparable to modern CRMs such as:

Zoho CRM

Freshsales

Requirements:

Fully responsive

Mobile-first

Professional dashboard

Collapsible sidebar

Large touch-friendly mobile buttons

Fast loading

Clean and modern interface

The system should be production-ready with data managed using database and optimized specifically for high-volume telecalling operations.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://tele-nexus-core.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8317d020-6d65-4485-8ce4-a48147550c29).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
